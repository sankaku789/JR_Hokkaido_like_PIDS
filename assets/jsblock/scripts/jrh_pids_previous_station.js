/* JCM正式版の公開済みクラスだけで前駅Arrivalを取得する互換層。 */

const jrhArrivalsCacheClient = Packages.org.mtr.mod.data.ArrivalsCacheClient;
const jrhLongImmutableList = Packages.org.mtr.libraries.it.unimi.dsi.fastutil.longs.LongImmutableList;
const jrhPreviousStationMaxTravelMs = 60 * 60 * 1000;

/** 同じ警告を毎フレーム出さないため、PIDS状態ごとに直近の状態を記録する。 */
function jrhPreviousStationDebug(state, key, message) {
    if(state.jrhPreviousStationDebug == null) {
        state.jrhPreviousStationDebug = {};
    }
    if(state.jrhPreviousStationDebug[key] == message) {
        return;
    }
    state.jrhPreviousStationDebug[key] = message;
    console.warn("[JRHPIDS previous-station] " + message);
}

/**
 * JCM v2.2.xのArrivalsCacheClientから前駅の同じ便を探す。
 * departureIndex完全一致を最優先し、正式版で一致候補が取れない場合だけ
 * routeId・編成両数・時刻関係を使ってフォールバックする。
 */
function findPreviousStationArrival(arrival, previousPlatformId) {
    let rawArrivals = jrhArrivalsCacheClient.INSTANCE.requestArrivals(
        jrhLongImmutableList.of(previousPlatformId));
    let millisOffset = Number(jrhArrivalsCacheClient.INSTANCE.getMillisOffset());
    let currentArrivalTime = Number(arrival.arrivalTime());
    let currentCarCount = Number(arrival.carCount());
    let currentDepartureIndex = String(arrival.departureIndex());
    let currentRouteId = String(arrival.routeId());

    let exactDepartureTime = null;
    let fallbackDepartureTime = null;

    for(let i = 0; i < rawArrivals.size(); i++) {
        let candidate = rawArrivals.get(i);
        if(candidate == null || String(candidate.getRouteId()) != currentRouteId) {
            continue;
        }

        let candidateCarCount = Number(candidate.getCarCount());
        if(currentCarCount > 0 && candidateCarCount > 0 &&
            currentCarCount != candidateCarCount) {
            continue;
        }

        let departureTime = Number(candidate.getDeparture()) - millisOffset;
        if(!isFinite(departureTime) || departureTime >= currentArrivalTime) {
            continue;
        }

        let travelTime = currentArrivalTime - departureTime;
        if(travelTime <= 0 || travelTime > jrhPreviousStationMaxTravelMs) {
            continue;
        }

        if(String(candidate.getDepartureIndex()) == currentDepartureIndex) {
            if(exactDepartureTime == null || departureTime > exactDepartureTime) {
                exactDepartureTime = departureTime;
            }
        } else if(fallbackDepartureTime == null || departureTime > fallbackDepartureTime) {
            fallbackDepartureTime = departureTime;
        }
    }

    let selectedDepartureTime = exactDepartureTime == null
        ? fallbackDepartureTime : exactDepartureTime;
    if(selectedDepartureTime == null) {
        return null;
    }

    return {
        departureTime: function() {
            return selectedDepartureTime;
        },
        exactMatch: exactDepartureTime != null,
        rawCount: rawArrivals.size()
    };
}

/**
 * 正式版互換の前駅発車キャッシュ更新。
 * renderer本体と同名にして、後からincludeされたこの実装で未公開API版を置き換える。
 */
function updatePreviousStationDepartureCache(arrivals, state, currentTimeMs) {
    let store = getPreviousStationDepartureStore(state);
    let seen = {};

    for(let i = 0; i < arrivals.length; i++) {
        let arrival = arrivals[i];
        if(arrival == null) {
            continue;
        }

        let key = getPreviousStationServiceKey(arrival);
        if(seen[key]) {
            continue;
        }
        seen[key] = true;

        let record = store[key];
        if(record == null) {
            record = {
                departureTimeMs: null,
                displayStartedAtMs: null,
                displayCompleted: false,
                lastSeenAtMs: currentTimeMs
            };
            store[key] = record;
        }
        record.lastSeenAtMs = currentTimeMs;

        // 発車時刻を跨いだ後は、その時刻を固定して表示判定に使う。
        if(record.departureTimeMs != null && currentTimeMs >= record.departureTimeMs) {
            continue;
        }

        try {
            let previousPlatformId = getPreviousStationPlatformId(arrival);
            if(previousPlatformId == null) {
                jrhPreviousStationDebug(state, key,
                    "previous platform not found: route=" + arrival.routeId() +
                    " platform=" + arrival.platformId());
                continue;
            }

            let previousArrival = findPreviousStationArrival(arrival, previousPlatformId);
            if(previousArrival == null) {
                jrhPreviousStationDebug(state, key,
                    "arrival not matched yet: route=" + arrival.routeId() +
                    " departureIndex=" + arrival.departureIndex() +
                    " previousPlatform=" + previousPlatformId);
                continue;
            }

            let departureTimeMs = Number(previousArrival.departureTime());
            if(isFinite(departureTimeMs)) {
                record.departureTimeMs = departureTimeMs;
                let matchType = previousArrival.exactMatch ? "exact" : "fallback";
                jrhPreviousStationDebug(state, key,
                    "matched(" + matchType + "): route=" + arrival.routeId() +
                    " departureIndex=" + arrival.departureIndex() +
                    " previousPlatform=" + previousPlatformId +
                    " rawCount=" + previousArrival.rawCount +
                    " departureTime=" + departureTimeMs);
            }
        } catch(e) {
            jrhPreviousStationDebug(state, key,
                "error: " + e);
        }
    }

    for(let key in store) {
        let record = store[key];
        if(record == null || currentTimeMs - record.lastSeenAtMs > jrhPreviousStationStateKeepMs) {
            delete store[key];
            if(state.jrhPreviousStationDebug != null) {
                delete state.jrhPreviousStationDebug[key];
            }
        }
    }
}

/**
 * renderer本体では前駅発車が接近表示開始より前の場合だけ表示するため、
 * 前駅発車後は第2行へ互換表示を上書きする。
 */
function jrhRenderPreviousStationOverlay(ctx, state, pids, theme) {
    let firstArrival = pids.arrivals().get(0);
    if(firstArrival == null || pids.isRowHidden(0)) {
        return;
    }

    let currentTimeMs = new Date().getTime();
    if(Number(firstArrival.arrivalTime()) <= currentTimeMs) {
        return;
    }

    let record = getPreviousStationDepartureRecord(firstArrival, state);
    if(record == null ||
        record.departureTimeMs == null ||
        Number(record.departureTimeMs) > currentTimeMs ||
        record.displayCompleted) {
        return;
    }

    if(record.displayStartedAtMs == null) {
        record.displayStartedAtMs = currentTimeMs;
    }

    let warningBlinkIntervalMs = numberOrDefault(
        SCRIPT_INPUT.arrivalWarningBlinkIntervalMs, 500);
    let blinkDurationMs = warningBlinkIntervalMs * jrhPreviousStationBlinkCount * 2;
    let elapsedMs = currentTimeMs - record.displayStartedAtMs;

    if(elapsedMs >= blinkDurationMs) {
        record.displayCompleted = true;
        return;
    }

    let sx = pids.width / 160.0;
    let sy = pids.height / 48.0;
    let unit = Math.min(sx, sy);
    let rowY = (14 + 13 + 4) * sy;

    rectangle(ctx, "Previous station overlay row",
        5 * sx, rowY, 150 * sx, 13 * sy, COLOR_BLACK);

    if(Math.floor(elapsedMs / warningBlinkIntervalMs) % 2 == 0) {
        drawText(ctx, "Previous station departure overlay",
            jrhPreviousStationDepartureText, theme.warning,
            7 * sx, rowY + 2 * sy, 146 * sx, 9, 1.08 * unit, "left", true);
    }
}
