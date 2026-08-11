/* JR北海道風ホーム発車標の共通renderer。 */

const jrhHomeMessageSwitchIntervalMs = 6000;

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
    let languageIndex = pids.isRowHidden(2)
        ? 0 : Math.floor(currentTimeMs / languageSwitchIntervalMs);
    let displayArrivals = getArrivalsByDepartureTime(pids, false);
    let firstArrival = pids.arrivals().get(0);
    let arrivalWarningActive = !pids.isRowHidden(0) &&
        firstArrival != null &&
        firstArrival.arrivalTime() > currentTimeMs &&
        firstArrival.arrivalTime() - currentTimeMs <= arrivalWarningSeconds * 1000;
    let warningBlinkVisible = Math.floor(currentTimeMs / warningBlinkIntervalMs) % 2 == 0;

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
    let messageCycleElapsed = currentTimeMs % (jrhHomeMessageSwitchIntervalMs * 2);
    let showAlternatingMessage = hasSecondMessage &&
        messageCycleElapsed >= jrhHomeMessageSwitchIntervalMs;

    for(let row = 0; row < 2; row++) {
        let arrival = row < displayArrivals.length ? displayArrivals[row] : null;
        let rowY = (HEADER_HEIGHT + row * (ROW_HEIGHT + ROW_GAP)) * sy;

        // 到着警告を常に2行目より優先し、点滅の非表示時は空欄にする。
        if(row == 1 && arrivalWarningActive) {
            if(warningBlinkVisible) {
                drawText(ctx, "Arrival warning", SCRIPT_INPUT.arrivalWarningText, theme.warning,
                    7 * sx, rowY + 2 * sy, 146 * sx, 9, 1.08 * unit, "left", true);
            }
            continue;
        }

        if(row == 1 && hasSecondMessage && (secondRowHidden || showAlternatingMessage)) {
            jrhHomeDrawMessageRow(ctx, secondMessageText, rowY, sx, sy, unit, theme);
            continue;
        }

        if(arrival == null) {
            if(row == 0) {
                drawText(ctx, "No train", SCRIPT_INPUT.noTrainText, theme.noTrain,
                    7 * sx, rowY + 2 * sy, 146 * sx, 9, 1.08 * unit, "left", true);
            }
            continue;
        }

        jrhHomeDrawArrivalRow(ctx, pids, arrival, row, rowY, sx, sy, unit, theme, languageIndex);
    }
}

/** ホーム発車標の列車情報1行を描画する。 */
function jrhHomeDrawArrivalRow(ctx, pids, arrival, row, rowY, sx, sy, unit, theme, languageIndex) {
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
    let destination = currentDestination(arrival, languageIndex);
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
function jrhHomeDrawMessageRow(ctx, message, rowY, sx, sy, unit, theme) {
    let scale = 1.08 * unit;
    createPidsText("Second message")
        .text(message)
        .color(theme.message)
        .pos(7 * sx, rowY + 2 * sy)
        .size((140 * sx) / scale, 9)
        .scale(scale)
        .leftAlign()
        .scaleXY()
        .draw(ctx);
}
