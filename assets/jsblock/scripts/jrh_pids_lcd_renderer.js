/* JR北海道風鉄路願景LCDの共通renderer。 */

const jrhLcdMessageSwitchIntervalMs = 6000;

/** テーマに従ってLCD発車標全体を描画する。 */
function jrhLcdRender(ctx, state, pids, theme) {
    const OUTER_PADDING = 3;
    const HEADER_HEIGHT = 11;
    const ROW_GAP = 1.5;
    const ROW_COUNT = 4;
    let w = pids.width;
    let h = pids.height;
    let backgroundColor = parseColor(SCRIPT_INPUT.backgroundColor, theme.defaultBackground);
    let rowsTop = HEADER_HEIGHT + OUTER_PADDING;
    let rowHeight = (h - rowsTop - OUTER_PADDING - ROW_GAP * (ROW_COUNT - 1)) / ROW_COUNT;
    let unit = Math.min(w / 160.0, h / 72.0);
    let currentTimeMs = new Date().getTime();
    let languageSwitchIntervalMs = numberOrDefault(
        SCRIPT_INPUT.languageSwitchIntervalMs, LANGUAGE_SWITCH_INTERVAL_MS);
    let languageIndex = pids.isRowHidden(1)
        ? 0 : Math.floor(currentTimeMs / languageSwitchIntervalMs);

    rectangle(ctx, "LCD background", 0, 0, w, h, backgroundColor);

    let headerMessage = pids.getCustomMessage(0);
    if(headerMessage == null || headerMessage.trim() == "") {
        headerMessage = SCRIPT_INPUT.directionText;
    }
    drawText(ctx, "LCD header message", currentLanguage(headerMessage, languageIndex), theme.header,
        5, 1.5, w - 10, 9, 0.9 * unit, "left", true);

    for(let row = 0; row < ROW_COUNT; row++) {
        let rowY = rowsTop + row * (rowHeight + ROW_GAP);
        rectangle(ctx, "LCD row " + row, OUTER_PADDING, rowY,
            w - OUTER_PADDING * 2, rowHeight, COLOR_BLACK);
    }

    // terminating列車を除外して後続列車を詰め、最大3件表示する。
    let displayArrivals = jrhLcdGetDisplayArrivals(pids, 3);
    let firstArrival = displayArrivals.length > 0 ? displayArrivals[0] : null;
    let firstTrainRowY = rowsTop;
    let firstStopsRowY = rowsTop + rowHeight + ROW_GAP;

    if(firstArrival == null) {
        drawText(ctx, "LCD no train", SCRIPT_INPUT.noTrainText, theme.noTrain,
            6, firstTrainRowY + 1, w - 12, 9, 0.92 * unit, "left", true);
    } else {
        jrhLcdDrawArrivalRow(ctx, pids, firstArrival, 0, firstTrainRowY, rowHeight, w, unit, theme, languageIndex);
        jrhLcdDrawStopsRow(ctx, firstArrival, 0, firstStopsRowY, rowHeight, w, unit, theme, 0);
    }

    for(let trainIndex = 1; trainIndex < 3; trainIndex++) {
        let arrival = trainIndex < displayArrivals.length ? displayArrivals[trainIndex] : null;
        let displayRow = trainIndex + 1;
        let rowY = rowsTop + displayRow * (rowHeight + ROW_GAP);

        // 3列目（4段目）は第2メッセージと交互に表示する。
        if(trainIndex == 2) {
            let secondMessage = pids.getCustomMessage(1);
            let hasSecondMessage = secondMessage != null && secondMessage.trim() != "";
            let secondMessageText = currentLanguage(secondMessage, languageIndex);
            let messageCycleElapsed = currentTimeMs % (jrhLcdMessageSwitchIntervalMs * 2);
            let showMessage = hasSecondMessage && (
                pids.isRowHidden(1) || messageCycleElapsed >= jrhLcdMessageSwitchIntervalMs
            );

            if(showMessage) {
                jrhLcdDrawMessageRow(ctx, secondMessageText, rowY, rowHeight, w, unit, theme);
                continue;
            }
        }

        if(arrival == null) {
            continue;
        }
        jrhLcdDrawArrivalRow(ctx, pids, arrival, trainIndex, rowY, rowHeight, w, unit, theme, languageIndex);
    }
}

/** 当駅止まりを除外し、発車時刻順の表示対象列車を上限件数まで取得する。 */
function jrhLcdGetDisplayArrivals(pids, limit) {
    return getArrivalsByDepartureTime(pids, true).slice(0, limit);
}

/** LCD発車標の列車情報1行を描画する。 */
function jrhLcdDrawArrivalRow(ctx, pids, arrival, set, rowY, rowHeight, w, unit, theme, languageIndex) {
    let routeNumber = currentLanguage(arrival.routeNumber(), languageIndex);
    let departure = formatClock(arrival.departureTime());
    let destination = currentDestination(arrival, languageIndex);
    let textY = rowY + Math.max(0.5, (rowHeight - 9 * unit) / 2);
    let sx = w / 160.0;

    if(theme.showRouteColor) {
        rectangle(ctx, "LCD route color " + set,
            6 * sx, rowY + 0.5, 52 * sx, rowHeight - 1, arrival.routeColor());
    }

    drawText(ctx, "LCD route " + set, routeNumber, theme.route,
        7 * sx, textY, 49 * sx, 9, 1.12 * unit, "left", true);
    drawText(ctx, "LCD departure " + set, departure, theme.departure,
        65 * sx, textY - 0.5, 27 * sx, 9, 1.32 * unit, "left", "stretch");

    let destinationWidth = pids.isPlatformNumberHidden() ? 57 * sx : 48 * sx;
    drawText(ctx, "LCD destination " + set, destination, theme.destination,
        96 * sx, textY, destinationWidth, 9, 1.12 * unit, "left", true);

    if(!pids.isPlatformNumberHidden()) {
        drawText(ctx, "LCD platform " + set, currentLanguage(arrival.platformName(), languageIndex), theme.platform,
            153 * sx, textY - 0.2, 8 * sx, 9, 1.32 * unit, "right", "stretch");
    }
}

/** LCD発車標の停車駅案内行を描画する。 */
function jrhLcdDrawStopsRow(ctx, arrival, set, rowY, rowHeight, w, unit, theme, languageIndex) {
    let message = jrhLcdGetCallingPointsMessage(arrival, languageIndex);
    let scale = 0.78 * unit;
    let viewportWidth = (w - 18) / scale;
    let textY = rowY + Math.max(0.5, (rowHeight - 9 * scale) / 2);
    createPidsText("LCD calling points " + set)
        .text(message)
        .color(theme.stops)
        .pos(6, textY)
        .size(viewportWidth, 9)
        .scale(scale)
        .leftAlign()
        .scaleXY()
        .draw(ctx);
}

/** LCD発車標の追加メッセージ行を描画する。 */
function jrhLcdDrawMessageRow(ctx, message, rowY, rowHeight, w, unit, theme) {
    let scale = 0.92 * unit;
    let textY = rowY + Math.max(0.5, (rowHeight - 9 * scale) / 2);
    createPidsText("LCD second message")
        .text(message)
        .color(theme.message)
        .pos(6, textY)
        .size((w - 20) / scale, 9)
        .scale(scale)
        .leftAlign()
        .scaleXY()
        .draw(ctx);
}

/** 列車の次停車駅から案内メッセージを組み立てる。 */
function jrhLcdGetCallingPointsMessage(arrival, languageIndex) {
    let route = arrival.route();
    if(route == null) {
        return currentDestination(arrival, languageIndex) + "に止まります。";
    }

    let platforms = route.getPlatforms();
    let currentIndex = route.getPlatformIndex(arrival.platformId());
    let startIndex = currentIndex < 0 ? 0 : currentIndex + 1;
    let names = [];
    let previousName = "";
    for(let i = startIndex; i < platforms.size(); i++) {
        let name = currentLanguage(platforms.get(i).getStationName(), languageIndex);
        if(name != "" && name != previousName) {
            names.push(name);
            previousName = name;
            if(names.length >= 2) {
                break;
            }
        }
    }

    if(names.length == 0) {
        return currentDestination(arrival, languageIndex) + "に止まります。";
    }
    if(names.length == 1) {
        return names[0] + "に止まります。";
    }
    return names.join("、") + "の順に止まります。";
}
