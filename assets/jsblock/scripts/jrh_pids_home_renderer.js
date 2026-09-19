/* JR北海道風ホーム発車標の共通renderer。 */

const jrhHomeMessageSwitchIntervalMs = 15000;
const jrhPreviousStationDepartureText = "隣の駅を出ました。";
const jrhPreviousStationBlinkCount = 3;
const jrhPreviousStationStateKeepMs = 60000;

/** テーマに従ってホーム発車標全体を描画する。 */
function jrhHomeRender(ctx, state, pids, theme) {
    let w = pids.width;
    let h = pids.height;
    let sx = w / 160.0;
    let sy = h / 48.0;
    let unit = Math.min(sx, sy);
    const HEADER_HEIGHT = 14;
    const ROW_HEIGHT = 13;
    const ROW_GAP = 4;
    let backgroundColor = parseColor(SCRIPT_INPUT.backgroundColor, theme.defaultBackground);
    let arrivalWarningSeconds = numberOrDefault(SCRIPT_INPUT.arrivalWarningSeconds, 25);
    let warningBlinkIntervalMs = numberOrDefault(SCRIPT_INPUT.arrivalWarningBlinkIntervalMs, 500);
    let currentTimeMs = new Date().getTime();
    let languageSwitchIntervalMs = numberOrDefault(
        SCRIPT_INPUT.languageSwitchIntervalMs, LANGUAGE_SWITCH_INTERVAL_MS);
    let displayPhase = Math.floor(currentTimeMs / languageSwitchIntervalMs);
    let languageIndex = pids.isRowHidden(2) ? 0 : displayPhase;
    let showDelay = displayPhase % 4 >= 2;
    let displayArrivals = getArrivalsByDepartureTime(pids, false);
    let firstArrival = pids.arrivals().get(0);
    let arrivalNoticeEnabled = !pids.isRowHidden(0);

    // 先発だけでなく次発も前駅発車時刻を事前取得しておく。
    // 前駅処理で例外が起きても既存のPIDS表示を止めない。
    let trackedArrivals = displayArrivals.slice(0, 2);
    if(firstArrival != null) {
        trackedArrivals.push(firstArrival);
    }
    try {
        updatePreviousStationDepartureCache(trackedArrivals, state, currentTimeMs);
    } catch(e) {
        // 前駅表示は追加機能なので、取得失敗時は通常表示と接近表示をそのまま継続する。
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
    let previousDepartureFirst = previousDepartureTime != null &&
        arrivalWarningDueAt != null &&
        previousDepartureTime < arrivalWarningDueAt;
    let previousDepartureBlinkDuration =
        warningBlinkIntervalMs * jrhPreviousStationBlinkCount * 2;

    // 次発の間に前駅を発車していても、先発へ繰り上がった時点から3回点滅を開始する。
    // イベントの順序判定は実際のdepartureTime()と接近開始時刻で行い、表示時間だけ別に持つ。
    if(arrivalNoticeEnabled &&
        firstArrival != null &&
        firstArrival.arrivalTime() > currentTimeMs &&
        previousDepartureRecord != null &&
        previousDepartureFirst &&
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
        previousDepartureFirst &&
        previousDepartureRecord.displayStartedAtMs != null &&
        !previousDepartureRecord.displayCompleted;
    let previousDepartureMessageVisible = previousDepartureMessageActive &&
        Math.floor(previousDepartureDisplayElapsed / warningBlinkIntervalMs) % 2 == 0;

    rectangle(ctx, "Navy background", 0, 0, w, h, backgroundColor);
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

        // 前駅発車が接近開始時刻より先なら、3回点滅を完了するまで接近表示を待たせる。
        if(row == 1 && previousDepartureMessageActive) {
            if(previousDepartureMessageVisible) {
                drawText(ctx, "Previous station departure", jrhPreviousStationDepartureText, theme.warning,
                    7 * sx, rowY + 2 * sy, 146 * sx, 9, 1.08 * unit, "left", true);
            }
            continue;
        }

        // 到着警告を常に2行目より優先し、点滅の非表示時は空欄にする。
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
    // 当駅止まりは「回送」と番線だけを描画し、路線色背景は出さない。
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
    let departure = formatClock(arrival.departureTime());
    let destination = currentDestinationOrDelay(arrival, languageIndex, showDelay);
    let platform = currentLanguage(arrival.platformName(), languageIndex);

    if(theme.showRouteColor) {
        rectangle(ctx, "Route color " + row,
            6 * sx, rowY + 1 * sy, 52 * sx, 11 * sy, arrival.routeColor());
    }

    drawText(ctx, "Route number " + row, routeNumber, theme.route,
        7 * sx, rowY + 2 * sy, 49 * sx, 9, 1.12 * unit, "left", true);
    drawText(ctx, "Departure " + row, departure, theme.departure,
        65 * sx, rowY + 1 * sy, 27 * sx, 9, 1.32 * unit, "left", "stretch");
    drawText(ctx, "Destination " + row, destination, theme.destination,
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

/** 前駅departureTime()を保持するPIDSインスタンス状態を返す。 */
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

/** 現在駅Arrivalのroute上で1つ前のplatform IDを返す。 */
function getPreviousStationPlatformId(arrival) {
    let route = arrival == null ? null : arrival.route();
    if(route == null) {
        return null;
    }

    let index = route.getPlatformIndex(arrival.platformId());
    if(index <= 0) {
        return null;
    }

    let previousPlatform = route.getPlatforms().get(index - 1);
    return previousPlatform == null ? null : previousPlatform.getPlatformId();
}

/** 前駅Arrival候補が現在駅Arrivalと同じ便か確認する。 */
function isSamePreviousStationService(currentArrival, candidate) {
    if(candidate == null ||
        String(currentArrival.departureIndex()) != String(candidate.departureIndex()) ||
        String(currentArrival.routeId()) != String(candidate.routeId()) ||
        currentArrival.carCount() != candidate.carCount()) {
        return false;
    }

    let currentCars = currentArrival.cars();
    let candidateCars = candidate.cars();
    if(currentCars != null && candidateCars != null &&
        currentCars.size() > 0 && candidateCars.size() > 0) {
        if(currentCars.size() != candidateCars.size()) {
            return false;
        }
        for(let i = 0; i < currentCars.size(); i++) {
            if(String(currentCars.get(i).getVehicleId()) !=
                String(candidateCars.get(i).getVehicleId())) {
                return false;
            }
        }
    }
    return true;
}

/** JCMのArrival APIから前駅の同じ便を探す。 */
function findPreviousStationArrival(arrival, previousPlatformId) {
    let arrivals = MTRUtil.Data.getArrivals(previousPlatformId);
    for(let i = 0; ; i++) {
        let candidate = arrivals.get(i);
        if(candidate == null) {
            return null;
        }
        if(isSamePreviousStationService(arrival, candidate)) {
            return candidate;
        }
    }
}

/** 先発・次発について、前駅発車前からdepartureTime()を継続保存する。 */
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

        // 一度発車時刻を跨いだらその時刻を固定し、後から予測値を動かさない。
        if(record.departureTimeMs != null && currentTimeMs >= record.departureTimeMs) {
            continue;
        }

        let previousPlatformId = getPreviousStationPlatformId(arrival);
        if(previousPlatformId == null) {
            continue;
        }

        let previousArrival = findPreviousStationArrival(arrival, previousPlatformId);
        if(previousArrival == null) {
            continue;
        }

        let departureTimeMs = Number(previousArrival.departureTime());
        if(isFinite(departureTimeMs)) {
            record.departureTimeMs = departureTimeMs;
        }
    }

    for(let key in store) {
        let record = store[key];
        if(record == null || currentTimeMs - record.lastSeenAtMs > jrhPreviousStationStateKeepMs) {
            delete store[key];
        }
    }
}

/** 指定Arrivalについて保存済みの前駅departureTime()と表示状態を返す。 */
function getPreviousStationDepartureRecord(arrival, state) {
    if(arrival == null || state.jrhPreviousStationDepartures == null) {
        return null;
    }
    let record = state.jrhPreviousStationDepartures[getPreviousStationServiceKey(arrival)];
    return record == null ? null : record;
}
