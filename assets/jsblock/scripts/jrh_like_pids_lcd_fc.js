/*
 * JR北海道風 鉄路願景LCD発車標
 * 1列車につき「列車情報＋停車駅」の2段、合計4段表示。
 */

include(Resources.id("jsblock:scripts/jrh_pids_common.js"));

const DEFAULT_COLOR_NAVY = 0x1D2053;
const COLOR_LED_WHITE = 0xFFFFFF;
const COLOR_TRACK_YELLOW = 0xFFFF00;
const MESSAGE_SWITCH_INTERVAL_MS = 6000;

function create(ctx, state, pids) {
}

function render(ctx, state, pids) {
    const OUTER_PADDING = 3;
    const HEADER_HEIGHT = 11;
    const ROW_GAP = 1.5;
    const ROW_COUNT = 4;
    let w = pids.width;
    let h = pids.height;
    let backgroundColor = parseColor(SCRIPT_INPUT.backgroundColor, DEFAULT_COLOR_NAVY);
    let rowsTop = HEADER_HEIGHT + OUTER_PADDING;
    let rowHeight = (h - rowsTop - OUTER_PADDING - ROW_GAP * (ROW_COUNT - 1)) / ROW_COUNT;
    let unit = Math.min(w / 160.0, h / 72.0);

    rectangle(ctx, "LCD background", 0, 0, w, h, backgroundColor);

    let headerMessage = pids.getCustomMessage(0);
    if(headerMessage == null || headerMessage.trim() == "") {
        headerMessage = SCRIPT_INPUT.directionText;
    }

    drawText(ctx, "LCD header message", primaryLanguage(headerMessage), COLOR_WHITE,
        5, 1.5, w - 10, 9, 0.9 * unit, "left", true);

    for(let row = 0; row < ROW_COUNT; row++) {
        let rowY = rowsTop + row * (rowHeight + ROW_GAP);
        rectangle(ctx, "LCD row " + row, OUTER_PADDING, rowY,
            w - OUTER_PADDING * 2, rowHeight, COLOR_BLACK);
    }

    let firstArrival = pids.arrivals().get(0);
    let firstTrainRowY = rowsTop;
    let firstStopsRowY = rowsTop + rowHeight + ROW_GAP;

    if(firstArrival == null) {
        drawText(ctx, "LCD no train", SCRIPT_INPUT.noTrainText, COLOR_GREEN,
            6, firstTrainRowY + 1, w - 12, 9, 0.92 * unit, "left", true);
    } else {
        drawArrivalRow(ctx, pids, firstArrival, 0, firstTrainRowY, rowHeight, w, unit);
        drawStopsRow(ctx, firstArrival, 0, firstStopsRowY, rowHeight, w, unit);
    }

    // Row 3 displays the second train.
    for(let trainIndex = 1; trainIndex < 3; trainIndex++) {
        let arrival = pids.arrivals().get(trainIndex);
        let displayRow = trainIndex + 1;
        let rowY = rowsTop + displayRow * (rowHeight + ROW_GAP);

        // The second configured message is shown on row 4. If the row is
        // hidden, the message stays visible; otherwise it alternates with
        // the third train.
        if(trainIndex == 2) {
            let secondMessage = pids.getCustomMessage(1);
            let hasSecondMessage = secondMessage != null && secondMessage.trim() != "";
            let currentTimeMs = new Date().getTime();
            let secondMessageText = primaryLanguage(secondMessage);
            let messageCycleDuration = MESSAGE_SWITCH_INTERVAL_MS * 2;
            let messageCycleElapsed = currentTimeMs % messageCycleDuration;
            let showMessage = hasSecondMessage && (
                pids.isRowHidden(1) || messageCycleElapsed >= MESSAGE_SWITCH_INTERVAL_MS
            );

            if(showMessage) {
                drawMessageRow(ctx, secondMessageText, rowY, rowHeight, w, unit);
                continue;
            }
        }

        if(arrival == null) {
            continue;
        }

        drawArrivalRow(ctx, pids, arrival, trainIndex, rowY, rowHeight, w, unit);
    }
}

function dispose(ctx, state, pids) {
}

function drawArrivalRow(ctx, pids, arrival, set, rowY, rowHeight, w, unit) {
    let routeNumber = primaryLanguage(arrival.routeNumber());
    let departure = formatClock(arrival.departureTime());
    let destination = primaryLanguage(arrival.destination());
    let textY = rowY + Math.max(0.5, (rowHeight - 9 * unit) / 2);
    let sx = w / 160.0;
    let routeColor = arrival.routeColor();

    rectangle(ctx, "LCD route color " + set,
        6 * sx, rowY + 0.5, 52 * sx, rowHeight - 1, routeColor);

    drawText(ctx, "LCD route " + set, routeNumber, COLOR_LED_WHITE,
        7 * sx, textY, 49 * sx, 9, 1.12 * unit, "left", true);

    drawText(ctx, "LCD departure " + set, departure, COLOR_LED_WHITE,
        65 * sx, textY - 0.5, 27 * sx, 9, 1.32 * unit, "left", "stretch");

    let destinationWidth = pids.isPlatformNumberHidden() ? 57 * sx : 48 * sx;
    drawText(ctx, "LCD destination " + set, destination, COLOR_LED_WHITE,
        96 * sx, textY, destinationWidth, 9, 1.12 * unit, "left", true);

    if(!pids.isPlatformNumberHidden()) {
        drawText(ctx, "LCD platform " + set, primaryLanguage(arrival.platformName()), COLOR_TRACK_YELLOW,
            153 * sx, textY - 0.2, 8 * sx, 9, 1.32 * unit, "right", "stretch");
    }
}

function drawStopsRow(ctx, arrival, set, rowY, rowHeight, w, unit) {
    let message = getCallingPointsMessage(arrival);
    let scale = 0.78 * unit;
    let viewportWidth = (w - 18) / scale;
    let textY = rowY + Math.max(0.5, (rowHeight - 9 * scale) / 2);
    createPidsText("LCD calling points " + set)
        .text(message)
        .color(COLOR_GREEN)
        .pos(6, textY)
        .size(viewportWidth, 9)
        .scale(scale)
        .leftAlign()
        .scaleXY()
        .draw(ctx);
}

function drawMessageRow(ctx, message, rowY, rowHeight, w, unit) {
    let scale = 0.92 * unit;
    let textY = rowY + Math.max(0.5, (rowHeight - 9 * scale) / 2);
    createPidsText("LCD second message")
        .text(message)
        .color(COLOR_GREEN)
        .pos(6, textY)
        .size((w - 20) / scale, 9)
        .scale(scale)
        .leftAlign()
        .scaleXY()
        .draw(ctx);
}

function getCallingPointsMessage(arrival) {
    let route = arrival.route();
    if(route == null) {
        return primaryLanguage(arrival.destination()) + "に止まります。";
    }

    let platforms = route.getPlatforms();
    let currentIndex = route.getPlatformIndex(arrival.platformId());
    let startIndex = currentIndex < 0 ? 0 : currentIndex + 1;
    let names = [];
    let previousName = "";

    for(let i = startIndex; i < platforms.size(); i++) {
        let name = primaryLanguage(platforms.get(i).getStationName());
        if(name != "" && name != previousName) {
            names.push(name);
            previousName = name;
            if(names.length >= 2) {
                break;
            }
        }
    }

    if(names.length == 0) {
        return primaryLanguage(arrival.destination()) + "に止まります。";
    }
    if(names.length == 1) {
        return names[0] + "に止まります。";
    }
    return names.join("、") + "の順に止まります。";
}

function drawText(ctx, comment, value, color, x, y, width, height, scale, align, fit) {
    let text = createPidsText(comment)
        .text(value == null ? "" : value.toString())
        .color(color)
        .pos(x, y)
        .size(width / scale, height)
        .scale(scale);

    if(align == "center") {
        text.centerAlign();
    } else if(align == "right") {
        text.rightAlign();
    } else {
        text.leftAlign();
    }

    if(fit) {
        text.scaleXY();
    }

    text.draw(ctx);
}
