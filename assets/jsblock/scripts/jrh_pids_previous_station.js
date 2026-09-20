/* JCM正式版の公開済みクラスだけで前駅Arrivalを取得する互換層。 */

const jrhArrivalsCacheClient = Packages.org.mtr.mod.data.ArrivalsCacheClient;
const jrhLongImmutableList = Packages.org.mtr.libraries.it.unimi.dsi.fastutil.longs.LongImmutableList;
const jrhPreviousStationMaxTravelMs = 60 * 60 * 1000;
const jrhPreviousStationColdRetryMs = 200;
const jrhPreviousStationUnmatchedRetryMs = 500;
const jrhPreviousStationNearRefreshMs = 500;
const jrhPreviousStationVeryNearRefreshMs = 250;
const jrhPreviousStationFarRefreshMs = 1500;
const jrhPreviousStationNearThresholdMs = 60 * 1000;
const jrhPreviousStationVeryNearThresholdMs = 5 * 1000;
const jrhPreviousStationSharedKeepMs = 60 * 1000;

const jrhPreviousStationSharedPlatforms = {};

/** JCMのscriptDebugModeが有効な場合だけ前駅診断を出す。 */
function jrhPreviousStationDebug(state, key, message) {
    if(state.jrhPreviousStationDebug == null) {
        state.jrhPreviousStationDebug = {};
    }
    if(state.jrhPreviousStationDebug[key] == message) {
        return;
    }
    state.jrhPreviousStationDebug[key] = message;
    console.debug("[JRHPIDS previous-station] " + message);
}

/** 実処理の例外だけは通常ログにも残す。 */
function jrhPreviousStationError(state, key, message) {
    if(state.jrhPreviousStationErrors == null) {
        state.jrhPreviousStationErrors = {};
    }
    if(state.jrhPreviousStationErrors[key] == message) {
        return;
    }
    state.jrhPreviousStationErrors[key] = message;
    console.warn("[JRHPIDS previous-station] " + message);
}

/** 発車までの残り時間に応じて前駅snapshotの再取得間隔を決める。 */
function jrhPreviousStationRefreshInterval(record, currentTimeMs) {
    if(record == null || record.departureTimeMs == null) {
        return jrhPreviousStationUnmatchedRetryMs;
    }

    let remainingMs = Number(record.departureTimeMs) - currentTimeMs;
    if(remainingMs <= jrhPreviousStationVeryNearThresholdMs) {
        return jrhPreviousStationVeryNearRefreshMs;
    }
    if(remainingMs <= jrhPreviousStationNearThresholdMs) {
        return jrhPreviousStationNearRefreshMs;
    }
    return jrhPreviousStationFarRefreshMs;
}

/**
 * 前駅platformのArrivalをprimitive中心のsnapshotへ変換する。
 * requestArrivals()自体がMTR内部のArrival全体を走査するため、同一platformでは共有する。
 */
function jrhRefreshPreviousStationSnapshot(previousPlatformId, currentTimeMs, refreshIntervalMs) {
    let key = String(previousPlatformId);
    let previous = jrhPreviousStationSharedPlatforms[key];
    let rawArrivals = jrhArrivalsCacheClient.INSTANCE.requestArrivals(
        jrhLongImmutableList.of(previousPlatformId));

    let byRoute = {};
    for(let i = 0; i < rawArrivals.size(); i++) {
        let candidate = rawArrivals.get(i);
        if(candidate == null) {
            continue;
        }

        let routeId = String(candidate.getRouteId());
        let routeKey = "r" + routeId;
        let bucket = byRoute[routeKey];
        if(bucket == null) {
            bucket = [];
            byRoute[routeKey] = bucket;
        }

        bucket.push({
            departureIndex: String(candidate.getDepartureIndex()),
            carCount: Number(candidate.getCarCount()),
            departureServerMs: Number(candidate.getDeparture())
        });
    }

    let generation = previous == null ? 1 : previous.generation + 1;
    let nextRefreshMs = rawArrivals.size() == 0
        ? jrhPreviousStationColdRetryMs
        : refreshIntervalMs;

    let snapshot = {
        generation: generation,
        rawCount: rawArrivals.size(),
        byRoute: byRoute,
        matches: {},
        refreshedAtMs: currentTimeMs,
        nextRefreshAtMs: currentTimeMs + nextRefreshMs,
        lastUsedAtMs: currentTimeMs
    };
    jrhPreviousStationSharedPlatforms[key] = snapshot;
    return snapshot;
}

/** 前駅platformの共有snapshotを取得し、必要なときだけMTR cacheを再走査する。 */
function jrhGetPreviousStationSnapshot(previousPlatformId, currentTimeMs, refreshIntervalMs) {
    let key = String(previousPlatformId);
    let snapshot = jrhPreviousStationSharedPlatforms[key];

    if(snapshot == null ||
        currentTimeMs >= snapshot.nextRefreshAtMs ||
        currentTimeMs - snapshot.refreshedAtMs >= refreshIntervalMs) {
        return jrhRefreshPreviousStationSnapshot(
            previousPlatformId, currentTimeMs, refreshIntervalMs);
    }

    snapshot.lastUsedAtMs = currentTimeMs;

    // 別の便がより高頻度の更新を必要とする場合、次回更新時刻だけ前倒しする。
    let requestedNextRefreshAt = currentTimeMs + refreshIntervalMs;
    if(requestedNextRefreshAt < snapshot.nextRefreshAtMs) {
        snapshot.nextRefreshAtMs = requestedNextRefreshAt;
    }
    return snapshot;
}

/**
 * 同一snapshot内で前駅の同じ便を探す。
 * departureIndex完全一致を最優先し、候補が無い場合だけ従来どおりfallbackする。
 */
function jrhFindPreviousStationArrivalFromSnapshot(arrival, snapshot, millisOffset) {
    let currentArrivalServerMs = Number(arrival.arrivalTime()) + millisOffset;
    let currentCarCount = Number(arrival.carCount());
    let currentDepartureIndex = String(arrival.departureIndex());
    let currentRouteId = String(arrival.routeId());

    let matchKey = getPreviousStationServiceKey(arrival) +
        ":a" + String(currentArrivalServerMs);
    let cachedMatch = snapshot.matches[matchKey];
    if(cachedMatch != null) {
        return cachedMatch.value;
    }

    let candidates = snapshot.byRoute["r" + currentRouteId];
    if(candidates == null) {
        snapshot.matches[matchKey] = {value: null};
        return null;
    }

    let exactDepartureServerMs = null;
    let fallbackDepartureServerMs = null;

    for(let i = 0; i < candidates.length; i++) {
        let candidate = candidates[i];

        if(currentCarCount > 0 && candidate.carCount > 0 &&
            currentCarCount != candidate.carCount) {
            continue;
        }

        let departureServerMs = candidate.departureServerMs;
        if(!isFinite(departureServerMs) ||
            departureServerMs >= currentArrivalServerMs) {
            continue;
        }

        let travelTime = currentArrivalServerMs - departureServerMs;
        if(travelTime <= 0 || travelTime > jrhPreviousStationMaxTravelMs) {
            continue;
        }

        if(candidate.departureIndex == currentDepartureIndex) {
            if(exactDepartureServerMs == null ||
                departureServerMs > exactDepartureServerMs) {
                exactDepartureServerMs = departureServerMs;
            }
        } else if(fallbackDepartureServerMs == null ||
            departureServerMs > fallbackDepartureServerMs) {
            fallbackDepartureServerMs = departureServerMs;
        }
    }

    let selectedDepartureServerMs = exactDepartureServerMs == null
        ? fallbackDepartureServerMs : exactDepartureServerMs;
    let result = selectedDepartureServerMs == null ? null : {
        departureServerMs: selectedDepartureServerMs,
        exactMatch: exactDepartureServerMs != null,
        rawCount: snapshot.rawCount
    };
    snapshot.matches[matchKey] = {value: result};
    return result;
}

/**
 * JCM v2.2.xのArrivalsCacheClientから前駅の同じ便を探す。
 * 既存の呼び出し互換を維持しつつ、内部では共有snapshotを利用する。
 */
function findPreviousStationArrival(arrival, previousPlatformId) {
    let currentTimeMs = new Date().getTime();
    let millisOffset = Number(jrhArrivalsCacheClient.INSTANCE.getMillisOffset());
    let snapshot = jrhGetPreviousStationSnapshot(
        previousPlatformId, currentTimeMs, jrhPreviousStationUnmatchedRetryMs);
    let match = jrhFindPreviousStationArrivalFromSnapshot(
        arrival, snapshot, millisOffset);
    if(match == null) {
        return null;
    }

    return {
        departureTime: function() {
            return match.departureServerMs - millisOffset;
        },
        exactMatch: match.exactMatch,
        rawCount: match.rawCount
    };
}

/**
 * 正式版互換の前駅発車キャッシュ更新。
 * renderer本体と同名にして、後からincludeされたこの実装で未公開API版を置き換える。
 */
function updatePreviousStationDepartureCache(arrivals, state, currentTimeMs) {
    let store = getPreviousStationDepartureStore(state);
    let seen = {};
    let millisOffset = Number(jrhArrivalsCacheClient.INSTANCE.getMillisOffset());

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
                departureServerMs: null,
                departureLocked: false,
                displayStartedAtMs: null,
                displayCompleted: false,
                lastSeenAtMs: currentTimeMs
            };
            store[key] = record;
        }
        record.lastSeenAtMs = currentTimeMs;

        // 発車前は最新のmillisOffsetだけ反映し、snapshot再走査なしでも時刻補正へ追従する。
        if(record.departureServerMs != null && !record.departureLocked) {
            record.departureTimeMs = record.departureServerMs - millisOffset;
        }

        // 発車時刻を跨いだ後は、その時刻を固定して表示判定に使う。
        if(record.departureTimeMs != null && currentTimeMs >= record.departureTimeMs) {
            record.departureLocked = true;
            continue;
        }

        try {
            let routeMetadata = jrhGetRoutePlatformMetadata(arrival, currentTimeMs);
            let previousPlatformId = routeMetadata == null
                ? null : routeMetadata.previousPlatformId;
            if(previousPlatformId == null) {
                jrhPreviousStationDebug(state, key,
                    "previous platform not found: route=" + arrival.routeId() +
                    " platform=" + arrival.platformId());
                continue;
            }

            let refreshIntervalMs = jrhPreviousStationRefreshInterval(
                record, currentTimeMs);
            let snapshot = jrhGetPreviousStationSnapshot(
                previousPlatformId, currentTimeMs, refreshIntervalMs);
            let previousArrival = jrhFindPreviousStationArrivalFromSnapshot(
                arrival, snapshot, millisOffset);

            if(previousArrival == null) {
                jrhPreviousStationDebug(state, key,
                    "arrival not matched yet: route=" + arrival.routeId() +
                    " departureIndex=" + arrival.departureIndex() +
                    " previousPlatform=" + previousPlatformId +
                    " rawCount=" + snapshot.rawCount);
                continue;
            }

            record.departureServerMs = previousArrival.departureServerMs;
            let departureTimeMs = previousArrival.departureServerMs - millisOffset;
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
            jrhPreviousStationError(state, key,
                "error: " + e);
        }
    }

    for(let key in store) {
        let record = store[key];
        if(record == null ||
            currentTimeMs - record.lastSeenAtMs > jrhPreviousStationStateKeepMs) {
            delete store[key];
            if(state.jrhPreviousStationDebug != null) {
                delete state.jrhPreviousStationDebug[key];
            }
            if(state.jrhPreviousStationErrors != null) {
                delete state.jrhPreviousStationErrors[key];
            }
        }
    }

    for(let platformKey in jrhPreviousStationSharedPlatforms) {
        let snapshot = jrhPreviousStationSharedPlatforms[platformKey];
        if(snapshot == null ||
            currentTimeMs - snapshot.lastUsedAtMs > jrhPreviousStationSharedKeepMs) {
            delete jrhPreviousStationSharedPlatforms[platformKey];
        }
    }
}
