/* JR北海道風ホーム発車標。 */

include(Resources.id("jsblock:scripts/jrh_pids_common.js"));

const jrhHomeMessageSwitchIntervalMs = 15000;
const jrhPreviousStationDepartureDefaultText = "隣の駅を出ました。";
const jrhPreviousStationBlinkCount = 4;
const jrhPreviousStationStateKeepMs = 60000;

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

/**
 * 前駅推定スクリプトが読み込めなかった場合のfail-safe。
 * 旧ArrivalsCache直アクセスへは戻さず、前駅案内だけを無効化する。
 */
function updatePreviousStationDepartureCache(arrivals, state, currentTimeMs) {
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
    // 前駅案内は実際に1行目へ描画している列車へ結び付ける。
    // 接近警告は既存挙動を維持するためpids.arrivals().get(0)のままにする。
    let previousStationArrival = displayArrivals.length > 0 ? displayArrivals[0] : firstArrival;
    let arrivalNoticeEnabled = !pids.isRowHidden(0);

    let trackedArrivals = displayArrivals.slice(0, 2);
    if(firstArrival != null) {
        trackedArrivals.push(firstArrival);
    }
    try {
        updatePreviousStationDepartureCache(trackedArrivals, state, currentTimeMs);
    } catch(e) {
    }

    if(typeof jrhPreviousStationDiag == "function" && previousStationArrival != null && firstArrival != null) {
        let previousKey = getPreviousStationServiceKey(previousStationArrival);
        let rawFirstKey = getPreviousStationServiceKey(firstArrival);
        if(previousKey != rawFirstKey) {
            jrhPreviousStationDiag(
                "display-target:" + previousKey,
                "display-target: previousStation=" + previousKey +
                " rawFirst=" + rawFirstKey +
                " route=" + previousStationArrival.routeName() +
                " departureIndex=" + previousStationArrival.departureIndex());
        }
    }

    let arrivalWarningDueAt = firstArrival == null
        ? null
        : firstArrival.arrivalTime() - arrivalWarningSeconds * 1000;
    let arrivalWarningActive = arrivalNoticeEnabled &&
        firstArrival != null &&
        firstArrival.arrivalTime() > currentTimeMs &&
        currentTimeMs >= arrivalWarningDueAt;
    let warningBlinkVisible = Math.floor(currentTimeMs / warningBlinkIntervalMs) % 2 == 0;

    let previousDepartureRecord = getPreviousStationDepartureRecord(previousStationArrival, state);
    let previousDepartureTime = previousDepartureRecord == null
        ? null : previousDepartureRecord.departureTimeMs;
    let previousDepartureBlinkCycleMs = warningBlinkIntervalMs * 2;
    let previousDepartureBlinkDuration = previousDepartureBlinkCycleMs * jrhPreviousStationBlinkCount;

    // 個別render時刻ではなく、次の共通ONサイクル境界から開始して駅内のPIDSを同期する。
    if(arrivalNoticeEnabled &&
        previousStationArrival != null &&
        previousStationArrival.arrivalTime() > currentTimeMs &&
        previousDepartureRecord != null &&
        previousDepartureTime != null &&
        previousDepartureTime <= currentTimeMs &&
        !previousDepartureRecord.displayCompleted &&
        previousDepartureRecord.displayStartedAtMs == null) {
        previousDepartureRecord.displayStartedAtMs =
            Math.ceil(currentTimeMs / previousDepartureBlinkCycleMs) * previousDepartureBlinkCycleMs;
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
        previousStationArrival != null &&
        previousStationArrival.arrivalTime() > currentTimeMs &&
        previousDepartureRecord != null &&
        previousDepartureTime != null &&
        previousDepartureTime <= currentTimeMs &&
        previousDepartureRecord.displayStartedAtMs != null &&
        currentTimeMs >= previousDepartureRecord.displayStartedAtMs &&
        !previousDepartureRecord.displayCompleted;
    let previousDepartureMessageVisible = previousDepartureMessageActive &&
        Math.floor(currentTimeMs / warningBlinkIntervalMs) % 2 == 0;

    if(typeof jrhPreviousStationDiag == "function" && previousStationArrival != null && previousDepartureRecord != null) {
        let previousKey = getPreviousStationServiceKey(previousStationArrival);
        jrhPreviousStationDiag(
            "display-state:" + previousKey,
            "display-state: key=" + previousKey +
            " active=" + previousDepartureMessageActive +
            " visible=" + previousDepartureMessageVisible +
            " arrivalFuture=" + (previousStationArrival.arrivalTime() > currentTimeMs) +
            " departureTime=" + previousDepartureTime +
            " started=" + previousDepartureRecord.displayStartedAtMs +
            " completed=" + previousDepartureRecord.displayCompleted);
    }

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
