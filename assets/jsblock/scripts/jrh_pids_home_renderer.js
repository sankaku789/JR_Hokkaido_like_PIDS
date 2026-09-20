/* JR北海道風ホーム発車標。 */

include(Resources.id("jsblock:scripts/jrh_pids_common.js"));

const jrhHomeMessageSwitchIntervalMs = 15000;
const jrhPreviousStationDepartureDefaultText = "隣の駅を出ました。";
const jrhPreviousStationBlinkCount = 4;
const jrhPreviousStationStateKeepMs = 60000;

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

/** 前駅departureTime()と表示状態を保持するPIDSインスタンス状態を返す。 */
function getPreviousStationDepartureStore(state) {
    if(state.jrhPreviousStationDepartures == null) {
        state.jrhPreviousStationDepartures = {};
    }
    return state.jrhPreviousStationDepartures;
}

/** Arrivalの補正時刻を含めず、同じ便を継続追跡するキーを作る。 */
function getPreviousStationServiceKey(arrival) {
    return String(arrival.departureIndex()) + ":" +
        String(arrival.routeId()) + ":" +
        String(arrival.platformId()) + ":" +
        String(arrival.carCount());
}

/** 指定Arrivalについて保存済みの前駅departureTime()と表示状態を返す。 */
function getPreviousStationDepartureRecord(arrival, state) {
    if(arrival == null || arrival.terminating() || state.jrhPreviousStationDepartures == null) {
        return null;
    }
    let record = state.jrhPreviousStationDepartures[getPreviousStationServiceKey(arrival)];
    return record == null ? null : record;
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

/** 前駅platformのArrivalを共有snapshotへ変換する。 */
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

        let routeKey = "r" + String(candidate.getRouteId());
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

    let nextRefreshMs = rawArrivals.size() == 0
        ? jrhPreviousStationColdRetryMs
        : refreshIntervalMs;
    let snapshot = {
        generation: previous == null ? 1 : previous.generation + 1,
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
    let requestedNextRefreshAt = currentTimeMs + refreshIntervalMs;
    if(requestedNextRefreshAt < snapshot.nextRefreshAtMs) {
        snapshot.nextRefreshAtMs = requestedNextRefreshAt;
    }
    return snapshot;
}

/** 同一snapshot内で前駅の同じ便を探す。 */
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
        if(!isFinite(departureServerMs) || departureServerMs >= currentArrivalServerMs) {
            continue;
        }

        let travelTime = currentArrivalServerMs - departureServerMs;
        if(travelTime <= 0 || travelTime > jrhPreviousStationMaxTravelMs) {
            continue;
        }

        if(candidate.departureIndex == currentDepartureIndex) {
            if(exactDepartureServerMs == null || departureServerMs > exactDepartureServerMs) {
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

/** 先発・次発について、前駅発車前からdepartureTime()を継続保存する。 */
function updatePreviousStationDepartureCache(arrivals, state, currentTimeMs) {
    let store = getPreviousStationDepartureStore(state);
    let seen = {};
    let millisOffset = Number(jrhArrivalsCacheClient.INSTANCE.getMillisOffset());

    for(let i = 0; i < arrivals.length; i++) {
        let arrival = arrivals[i];
        if(arrival == null || arrival.terminating()) {
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

        if(record.departureServerMs != null && !record.departureLocked) {
            record.departureTimeMs = record.departureServerMs - millisOffset;
        }

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

            let refreshIntervalMs = jrhPreviousStationRefreshInterval(record, currentTimeMs);
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
            jrhPreviousStationError(state, key, "error: " + e);
        }
    }

    for(let key in store) {
        let record = store[key];
        if(record == null || currentTimeMs - record.lastSeenAtMs > jrhPreviousStationStateKeepMs) {
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

/** ホーム発車標全体を描画する。 */
function jrhHomeRender(ctx, state, pids, theme) {
    let w = pids.width;
    let h = pids.height;
    let sx = w / 160.0;
    let sy = h / 48.0;
    let unit = Math.min(sx, sy);
    const HEADER_HEIGHT = 14;
    const ROW_HEIGHT = 13;
    const ROW_GAP = 4;

    let previousStationDepartureText = SCRIPT_INPUT.previousStationDepartureText == null
        ? jrhPreviousStationDepartureDefaultText
        : String(SCRIPT_INPUT.previousStationDepartureText);
    let arrivalWarningSeconds = numberOrDefault(SCRIPT_INPUT.arrivalWarningSeconds, 25);
    let warningBlinkIntervalMs = numberOrDefault(SCRIPT_INPUT.arrivalWarningBlinkIntervalMs, 500);
    let currentTimeMs = new Date().getTime();
    let languageSwitchIntervalMs = numberOrDefault(
        SCRIPT_INPUT.languageSwitchIntervalMs, LANGUAGE_SWITCH_INTERVAL_MS);
    let displayPhase = Math.floor(currentTimeMs / languageSwitchIntervalMs);
    let languageIndex = pids.isRowHidden(2) ? 0 : displayPhase;
    let showDelay = displayPhase % 4 >= 2;
    let displayArrivals = getTopArrivalsByDepartureTime(pids, false, 2);
    let firstArrival = pids.arrivals().get(0);
    let arrivalNoticeEnabled = !pids.isRowHidden(0);

    let trackedArrivals = displayArrivals.slice(0, 2);
    if(firstArrival != null) {
        trackedArrivals.push(firstArrival);
    }
    try {
        updatePreviousStationDepartureCache(trackedArrivals, state, currentTimeMs);
    } catch(e) {
    }

    let arrivalWarningDueAt = firstArrival == null
        ? null
        : firstArrival.arrivalTime() - arrivalWarningSeconds * 1000;
    let arrivalWarningActive = arrivalNoticeEnabled &&
        firstArrival != null &&
        firstArrival.arrivalTime() > currentTimeMs &&
        currentTimeMs >= arrivalWarningDueAt;
    let warningBlinkVisible = Math.floor(currentTimeMs / warningBlinkIntervalMs) % 2 == 0;

    let previousDepartureRecord = getPreviousStationDepartureRecord(firstArrival, state);
    let previousDepartureTime = previousDepartureRecord == null
        ? null : previousDepartureRecord.departureTimeMs;
    let previousDepartureBlinkDuration = warningBlinkIntervalMs * jrhPreviousStationBlinkCount * 2;

    if(arrivalNoticeEnabled &&
        firstArrival != null &&
        firstArrival.arrivalTime() > currentTimeMs &&
        previousDepartureRecord != null &&
        previousDepartureTime != null &&
        previousDepartureTime <= currentTimeMs &&
        !previousDepartureRecord.displayCompleted &&
        previousDepartureRecord.displayStartedAtMs == null) {
        previousDepartureRecord.displayStartedAtMs = currentTimeMs;
    }

    let previousDepartureDisplayElapsed =
        previousDepartureRecord == null || previousDepartureRecord.displayStartedAtMs == null
            ? -1
            : currentTimeMs - previousDepartureRecord.displayStartedAtMs;

    if(previousDepartureRecord != null &&
        previousDepartureRecord.displayStartedAtMs != null &&
        !previousDepartureRecord.displayCompleted &&
        previousDepartureDisplayElapsed >= previousDepartureBlinkDuration) {
        previousDepartureRecord.displayCompleted = true;
    }

    let previousDepartureMessageActive = arrivalNoticeEnabled &&
        firstArrival != null &&
        firstArrival.arrivalTime() > currentTimeMs &&
        previousDepartureRecord != null &&
        previousDepartureTime != null &&
        previousDepartureTime <= currentTimeMs &&
        previousDepartureRecord.displayStartedAtMs != null &&
        !previousDepartureRecord.displayCompleted;
    let previousDepartureMessageVisible = previousDepartureMessageActive &&
        Math.floor(previousDepartureDisplayElapsed / warningBlinkIntervalMs) % 2 == 0;

    rectangle(ctx, "Navy background", 0, 0, w, h, theme.background);
    rectangle(ctx, "Departure row 1", 5 * sx, HEADER_HEIGHT * sy, 150 * sx, ROW_HEIGHT * sy, COLOR_BLACK);
    rectangle(ctx, "Departure row 2", 5 * sx, (HEADER_HEIGHT + ROW_HEIGHT + ROW_GAP) * sy, 150 * sx, ROW_HEIGHT * sy, COLOR_BLACK);

    let headerMessage = pids.getCustomMessage(0);
    if(headerMessage == null || headerMessage.trim() == "") {
        headerMessage = SCRIPT_INPUT.directionText;
    }
    drawText(ctx, "Header message", currentLanguage(headerMessage, languageIndex), theme.header,
        7 * sx, 3 * sy, 146 * sx, 9, 1.05 * unit, "left", true);

    let secondMessage = pids.getCustomMessage(1);
    let hasSecondMessage = secondMessage != null && secondMessage.trim() != "";
    let secondRowHidden = pids.isRowHidden(1);
    let secondMessageText = currentLanguage(secondMessage, languageIndex);
    let secondMessageScrolls = Array.from(secondMessageText).length >= MESSAGE_SCROLL_MIN_CHARS;
    let secondMessageDurationMs = secondMessageScrolls
        ? getMessageMarqueeDuration(secondMessageText) * 1000
        : jrhHomeMessageSwitchIntervalMs;
    let messageCycleElapsed = currentTimeMs %
        (jrhHomeMessageSwitchIntervalMs + secondMessageDurationMs);
    let showAlternatingMessage = hasSecondMessage &&
        messageCycleElapsed >= jrhHomeMessageSwitchIntervalMs;

    for(let row = 0; row < 2; row++) {
        let arrival = row < displayArrivals.length ? displayArrivals[row] : null;
        let rowY = (HEADER_HEIGHT + row * (ROW_HEIGHT + ROW_GAP)) * sy;

        if(row == 1 && previousDepartureMessageActive) {
            if(previousDepartureMessageVisible) {
                drawText(ctx, "Previous station departure", previousStationDepartureText, theme.warning,
                    7 * sx, rowY + 2 * sy, 146 * sx, 9, 1.08 * unit, "left", true);
            }
            continue;
        }

        if(row == 1 && arrivalWarningActive) {
            if(warningBlinkVisible) {
                drawText(ctx, "Arrival warning", SCRIPT_INPUT.arrivalWarningText, theme.warning,
                    7 * sx, rowY + 2 * sy, 146 * sx, 9, 1.08 * unit, "left", true);
            }
            continue;
        }

        if(row == 1 && hasSecondMessage && (secondRowHidden || showAlternatingMessage)) {
            let marqueeProgress = !secondRowHidden && secondMessageScrolls
                ? (messageCycleElapsed - jrhHomeMessageSwitchIntervalMs) / secondMessageDurationMs
                : null;
            jrhHomeDrawMessageRow(ctx, secondMessageText, rowY, sx, sy, unit, theme, marqueeProgress);
            continue;
        }

        if(arrival == null) {
            if(row == 0) {
                drawText(ctx, "No train", SCRIPT_INPUT.noTrainText, theme.noTrain,
                    7 * sx, rowY + 2 * sy, 146 * sx, 9, 1.08 * unit, "left", true);
            }
            continue;
        }

        jrhHomeDrawArrivalRow(ctx, pids, arrival, row, rowY, sx, sy, unit, theme, languageIndex, showDelay);
    }
}

/** ホーム発車標の列車情報1行を描画する。 */
function jrhHomeDrawArrivalRow(ctx, pids, arrival, row, rowY, sx, sy, unit, theme, languageIndex, showDelay) {
    if(arrival.terminating()) {
        let outOfServiceText = SCRIPT_INPUT.outOfServiceText == null
            ? "回送|Out Of Service" : SCRIPT_INPUT.outOfServiceText;
        drawText(ctx, "Out of service " + row,
            currentLanguage(outOfServiceText, languageIndex), theme.outOfService,
            7 * sx, rowY + 2 * sy, 49 * sx, 9, 1.12 * unit, "left", true);
        if(!pids.isPlatformNumberHidden()) {
            drawText(ctx, "Platform " + row, currentLanguage(arrival.platformName(), languageIndex), theme.platform,
                153 * sx, rowY + 1.3 * sy, 8 * sx, 9, 1.32 * unit, "right", "stretch");
        }
        return;
    }

    let routeNumber = currentLanguage(arrival.routeNumber(), languageIndex);
    let departure = formatClock(jrhDisplayDepartureTime(arrival));
    let destination = currentDestinationOrDelay(arrival, languageIndex, showDelay);
    let destinationColor = jrhIsDelayVisible(arrival, showDelay) ? COLOR_RED : theme.destination;
    let platform = currentLanguage(arrival.platformName(), languageIndex);

    if(theme.showRouteColor && jrhRouteNumberIsPresent(routeNumber)) {
        rectangle(ctx, "Route color " + row,
            6 * sx, rowY + 1 * sy, 52 * sx, 11 * sy, arrival.routeColor());
    }

    drawText(ctx, "Route number " + row, routeNumber, theme.route,
        7 * sx, rowY + 2 * sy, 49 * sx, 9, 1.12 * unit, "left", true);
    drawText(ctx, "Departure " + row, departure, theme.departure,
        65 * sx, rowY + 1 * sy, 27 * sx, 9, 1.32 * unit, "left", "stretch");
    drawText(ctx, "Destination " + row, destination, destinationColor,
        96 * sx, rowY + 2 * sy, 48 * sx, 9, 1.12 * unit, "left", true);

    if(!pids.isPlatformNumberHidden()) {
        drawText(ctx, "Platform " + row, platform, theme.platform,
            153 * sx, rowY + 1.3 * sy, 8 * sx, 9, 1.32 * unit, "right", "stretch");
    }
}

/** ホーム発車標の追加メッセージ行を描画する。 */
function jrhHomeDrawMessageRow(ctx, message, rowY, sx, sy, unit, theme, marqueeProgress) {
    let scale = 1.08 * unit;
    let text = createPidsText("Second message")
        .text(message)
        .color(theme.message)
        .pos(7 * sx, rowY + 2 * sy)
        .size((140 * sx) / scale, 9)
        .scale(scale)
        .leftAlign();
    if(Array.from(message).length >= MESSAGE_SCROLL_MIN_CHARS) {
        text.marquee(getMessageMarqueeDuration(message));
        if(marqueeProgress != null) {
            text.withMarqueeProgress(marqueeProgress);
        }
    }
    text.draw(ctx);
}

/** ホーム発車標の描画状態を初期化する。 */
function create(ctx, state, pids) {
}

/** ScriptInputの配色モードでホーム発車標を描画する。 */
function render(ctx, state, pids) {
    jrhHomeRender(ctx, state, pids, jrhGetConfiguredTheme());
}

/** ホーム発車標の描画資源を解放する。 */
function dispose(ctx, state, pids) {
}
