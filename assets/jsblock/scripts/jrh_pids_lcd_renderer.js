/* JR北海道風鉄路願景LCD発車標。 */

include(Resources.id("jsblock:scripts/jrh_pids_common.js"));

const jrhLcdMessageSwitchIntervalMs = 15000;
const LCD_MESSAGE_SCROLL_MIN_CHARS = 22;

/** LCD発車標全体を描画する。 */
function jrhLcdRender(ctx, state, pids, theme) {
    const OUTER_PADDING = 3;
    const HEADER_HEIGHT = 11;
    const ROW_GAP = 1.5;
    const ROW_COUNT = 4;
    let w = pids.width;
    let h = pids.height;
    let rowsTop = HEADER_HEIGHT + OUTER_PADDING;
    let rowHeight = (h - rowsTop - OUTER_PADDING - ROW_GAP * (ROW_COUNT - 1)) / ROW_COUNT;
    let unit = Math.min(w / 160.0, h / 72.0);
    let currentTimeMs = new Date().getTime();
    let languageSwitchIntervalMs = numberOrDefault(
        SCRIPT_INPUT.languageSwitchIntervalMs, LANGUAGE_SWITCH_INTERVAL_MS);
    let displayPhase = Math.floor(currentTimeMs / languageSwitchIntervalMs);
    let languageIndex = pids.isRowHidden(2) ? 0 : displayPhase;
    let showDelay = displayPhase % 4 >= 2;

    rectangle(ctx, "LCD background", 0, 0, w, h, theme.background);

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

    let displayArrivals = getTopArrivalsByDepartureTime(pids, true, 3);
    let firstArrival = displayArrivals.length > 0 ? displayArrivals[0] : null;
    let firstTrainRowY = rowsTop;
    let firstStopsRowY = rowsTop + rowHeight + ROW_GAP;

    if(firstArrival == null) {
        drawText(ctx, "LCD no train", SCRIPT_INPUT.noTrainText, theme.noTrain,
            6, firstTrainRowY + 1, w - 12, 9, 0.92 * unit, "left", true);
    } else {
        jrhLcdDrawArrivalRow(ctx, pids, firstArrival, 0, firstTrainRowY, rowHeight,
            w, unit, theme, languageIndex, showDelay);
        jrhLcdDrawStopsRow(ctx, firstArrival, 0, firstStopsRowY, rowHeight,
            w, unit, theme, 0, currentTimeMs);
    }

    for(let trainIndex = 1; trainIndex < 3; trainIndex++) {
        let arrival = trainIndex < displayArrivals.length ? displayArrivals[trainIndex] : null;
        let displayRow = trainIndex + 1;
        let rowY = rowsTop + displayRow * (rowHeight + ROW_GAP);

        if(trainIndex == 2) {
            let secondMessage = pids.getCustomMessage(1);
            let hasSecondMessage = secondMessage != null && secondMessage.trim() != "";
            let secondMessageText = currentLanguage(secondMessage, languageIndex);
            let secondRowHidden = pids.isRowHidden(1);
            let secondMessageScrolls = Array.from(secondMessageText).length >= LCD_MESSAGE_SCROLL_MIN_CHARS;
            let secondMessageDurationMs = secondMessageScrolls
                ? getMessageMarqueeDuration(secondMessageText) * 1000
                : jrhLcdMessageSwitchIntervalMs;
            let messageCycleElapsed = currentTimeMs %
                (jrhLcdMessageSwitchIntervalMs + secondMessageDurationMs);
            let showMessage = hasSecondMessage && (
                secondRowHidden || messageCycleElapsed >= jrhLcdMessageSwitchIntervalMs
            );

            if(showMessage) {
                let marqueeProgress = !secondRowHidden && secondMessageScrolls
                    ? (messageCycleElapsed - jrhLcdMessageSwitchIntervalMs) / secondMessageDurationMs
                    : null;
                jrhLcdDrawMessageRow(ctx, secondMessageText, rowY, rowHeight,
                    w, unit, theme, marqueeProgress);
                continue;
            }
        }

        if(arrival == null) {
            continue;
        }
        jrhLcdDrawArrivalRow(ctx, pids, arrival, trainIndex, rowY, rowHeight,
            w, unit, theme, languageIndex, showDelay);
    }
}

/** LCD発車標の列車情報1行を描画する。 */
function jrhLcdDrawArrivalRow(ctx, pids, arrival, set, rowY, rowHeight, w, unit, theme, languageIndex, showDelay) {
    let routeNumber = currentLanguage(arrival.routeNumber(), languageIndex);
    let departure = formatClock(jrhDisplayDepartureTime(arrival));
    let destination = currentDestinationOrDelay(arrival, languageIndex, showDelay);
    let destinationColor = jrhIsDelayVisible(arrival, showDelay) ? COLOR_RED : theme.destination;
    let textY = rowY + Math.max(0.5, (rowHeight - 9 * unit) / 2);
    let sx = w / 160.0;

    if(theme.showRouteColor && jrhRouteNumberIsPresent(routeNumber)) {
        rectangle(ctx, "LCD route color " + set,
            6 * sx, rowY + 0.5, 52 * sx, rowHeight - 1, arrival.routeColor());
    }

    drawText(ctx, "LCD route " + set, routeNumber, theme.route,
        7 * sx, textY, 49 * sx, 9, 1.12 * unit, "left", true);
    drawText(ctx, "LCD departure " + set, departure, theme.departure,
        65 * sx, textY - 0.5, 27 * sx, 9, 1.32 * unit, "left", "stretch");

    let destinationWidth = pids.isPlatformNumberHidden() ? 57 * sx : 48 * sx;
    drawText(ctx, "LCD destination " + set, destination, destinationColor,
        96 * sx, textY, destinationWidth, 9, 1.12 * unit, "left", true);

    if(!pids.isPlatformNumberHidden()) {
        drawText(ctx, "LCD platform " + set, currentLanguage(arrival.platformName(), languageIndex), theme.platform,
            153 * sx, textY - 0.2, 8 * sx, 9, 1.32 * unit, "right", "stretch");
    }
}

/** LCD発車標の2段目に編成・停車駅案内を表示する。 */
function jrhLcdDrawStopsRow(ctx, arrival, set, rowY, rowHeight, w, unit, theme, languageIndex, currentTimeMs) {
    let message = jrhLcdGetTrainInfoMessage(arrival, languageIndex, currentTimeMs);
    let trainInfoTheme = {message: theme.stops};
    jrhLcdDrawMessageRow(ctx, message, rowY, rowHeight, w, unit, trainInfoTheme, null);
}

/** LCD発車標の追加メッセージ行を描画する。 */
function jrhLcdDrawMessageRow(ctx, message, rowY, rowHeight, w, unit, theme, marqueeProgress) {
    let scale = 0.92 * unit;
    let textY = rowY + Math.max(0.5, (rowHeight - 9 * scale) / 2);
    let text = createPidsText("LCD second message")
        .text(message)
        .color(theme.message)
        .pos(6, textY)
        .size((w - 20) / scale, 9)
        .scale(scale)
        .leftAlign();
    if(Array.from(message).length >= LCD_MESSAGE_SCROLL_MIN_CHARS) {
        text.marquee(getMessageMarqueeDuration(message));
        if(marqueeProgress != null) {
            text.withMarqueeProgress(marqueeProgress);
        }
    }
    text.draw(ctx);
}

/** 先発列車の編成両数と、現在駅より先の停車駅を路線終点まで列挙する。 */
function jrhLcdGetTrainInfoMessage(arrival, languageIndex, currentTimeMs) {
    let carCount = Number(arrival.carCount());
    if(!isFinite(carCount) || carCount < 0) {
        carCount = 0;
    }

    let names = [];
    let metadata = jrhGetRoutePlatformMetadata(arrival, currentTimeMs);
    if(metadata != null) {
        let previousName = "";
        for(let i = 0; i < metadata.followingStationNames.length; i++) {
            let name = currentLanguage(metadata.followingStationNames[i], languageIndex);
            if(name != "" && name != previousName) {
                names.push(name);
                previousName = name;
            }
        }
    }

    if(names.length == 0) {
        let destination = currentDestination(arrival, languageIndex);
        if(destination != "") {
            names.push(destination);
        }
    }

    let message = "この列車は" + carCount + "両編成です。";
    if(names.length > 0) {
        message += "停車駅は" + names.join("・") + "です。";
    }
    return message;
}

/** LCD発車標の描画状態を初期化する。 */
function create(ctx, state, pids) {
}

/** ScriptInputの配色モードでLCD発車標を描画する。 */
function render(ctx, state, pids) {
    jrhLcdRender(ctx, state, pids, jrhGetConfiguredTheme());
}

/** LCD発車標の描画資源を解放する。 */
function dispose(ctx, state, pids) {
}
