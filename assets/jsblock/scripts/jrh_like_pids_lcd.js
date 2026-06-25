/*
 * JR北海道風 鉄路願景LCD発車標
 * 1列車につき「列車情報＋停車駅」の2段、合計4段表示。
 */

const DEFAULT_COLOR_NAVY = 0x05051F;
const COLOR_BLACK = 0x000000;
const COLOR_WHITE = 0xF4F4FF;
const COLOR_RED = 0xFF1800;
const COLOR_GREEN = 0x16FF35;
const COLOR_ORANGE = 0xFF9D00;
const WHITE_TEXTURE = "mtr:textures/block/white.png";
const MESSAGE_SWITCH_INTERVAL_MS = 6000;
const MARQUEE_SPEED_UNITS_PER_SECOND = 1.5;

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
            let messageScale = 0.92 * unit;
            let messageViewportWidth = (w - 20) / messageScale;
            let messageMarqueeDurationMs = getMarqueeDurationMs(secondMessageText, messageViewportWidth);
            let messageCycleDuration = MESSAGE_SWITCH_INTERVAL_MS + messageMarqueeDurationMs;
            let messageCycleElapsed = currentTimeMs % messageCycleDuration;
            let showMessage = hasSecondMessage && (
                pids.isRowHidden(1) || messageCycleElapsed >= MESSAGE_SWITCH_INTERVAL_MS
            );
            let messageScrollProgress = messageCycleElapsed >= MESSAGE_SWITCH_INTERVAL_MS ?
                (messageCycleElapsed - MESSAGE_SWITCH_INTERVAL_MS) / messageMarqueeDurationMs : 0;

            if(showMessage) {
                drawMessageRow(ctx, secondMessageText, rowY, rowHeight, w, unit,
                    pids.isRowHidden(1) ? -1 : messageScrollProgress, messageMarqueeDurationMs);
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

    drawText(ctx, "LCD route " + set, routeNumber, COLOR_GREEN,
        7 * sx, textY, 49 * sx, 9, 1.12 * unit, "left", true);

    drawText(ctx, "LCD departure " + set, departure, COLOR_GREEN,
        65 * sx, textY - 0.5, 27 * sx, 9, 1.32 * unit, "left", false);

    let destinationWidth = pids.isPlatformNumberHidden() ? 57 * sx : 48 * sx;
    drawText(ctx, "LCD destination " + set, destination, COLOR_GREEN,
        96 * sx, textY, destinationWidth, 9, 1.12 * unit, "left", true);

    if(!pids.isPlatformNumberHidden()) {
        drawText(ctx, "LCD platform " + set, primaryLanguage(arrival.platformName()), COLOR_ORANGE,
            153 * sx, textY - 0.5, 8 * sx, 9, 1.32 * unit, "right", false);
    }
}

function drawStopsRow(ctx, arrival, set, rowY, rowHeight, w, unit) {
    let message = "停車駅: " + getCallingPoints(arrival);
    let scale = 0.78 * unit;
    let viewportWidth = (w - 18) / scale;
    let durationTicks = getMarqueeDurationMs(message, viewportWidth) / 50;
    let textY = rowY + Math.max(0.5, (rowHeight - 9 * scale) / 2);
    let text = Text.create("LCD calling points " + set)
        .text(message)
        .fontMC()
        .color(COLOR_ORANGE)
        .pos(6, textY)
        .size(viewportWidth, 9)
        .scale(scale)
        .leftAlign();

    if(message.length > 26) {
        text.marquee(durationTicks);
    }

    text.draw(ctx);
}

function drawMessageRow(ctx, message, rowY, rowHeight, w, unit, scrollProgress, durationMs) {
    let scale = 0.92 * unit;
    let durationTicks = durationMs / 50;
    let textY = rowY + Math.max(0.5, (rowHeight - 9 * scale) / 2);
    let text = Text.create("LCD second message")
        .text(message)
        .fontMC()
        .color(COLOR_RED)
        .pos(6, textY)
        .size((w - 20) / scale, 9)
        .scale(scale)
        .leftAlign();

    if(scrollProgress < 0) {
        text.marquee(durationTicks);
    } else {
        text.marquee(durationTicks)
            .withMarqueeProgress(scrollProgress);
    }

    text.draw(ctx);
}

function getMarqueeDurationMs(message, viewportWidth) {
    let travelDistance = estimateTextWidth(message) + viewportWidth;
    return Math.max(3000, travelDistance / MARQUEE_SPEED_UNITS_PER_SECOND * 1000);
}

function estimateTextWidth(message) {
    let width = 0;
    for(let i = 0; i < message.length; i++) {
        width += message.charCodeAt(i) <= 0x7F ? 6 : 9;
    }
    return width;
}

function getCallingPoints(arrival) {
    let route = arrival.route();
    if(route == null) {
        return primaryLanguage(arrival.destination());
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
        }
    }

    return names.length == 0 ? primaryLanguage(arrival.destination()) : names.join("・");
}

function primaryLanguage(value) {
    if(value == null) {
        return "";
    }
    let text = value.toString();
    let separator = text.indexOf("|");
    return (separator < 0 ? text : text.substring(0, separator)).trim();
}

function formatClock(epochMillis) {
    let date = new Date(epochMillis);
    return pad2(date.getHours()) + ":" + pad2(date.getMinutes());
}

function pad2(value) {
    return value < 10 ? "0" + value : value.toString();
}

function parseColor(value, fallback) {
    if(value == null) {
        return fallback;
    }
    let text = value.toString().replace("#", "").replace("0x", "");
    let color = parseInt(text, 16);
    return isNaN(color) ? fallback : color;
}

function rectangle(ctx, comment, x, y, width, height, color) {
    Texture.create(comment)
        .texture(WHITE_TEXTURE)
        .color(color)
        .pos(x, y)
        .size(width, height)
        .draw(ctx);
}

function drawText(ctx, comment, value, color, x, y, width, height, scale, align, fit) {
    let text = Text.create(comment)
        .text(value == null ? "" : value.toString())
        .fontMC()
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
