/*
 * JR北海道の駅発車標をイメージした JCM v2 Scripted PIDS preset.
 * MTR 4 / Minecraft 1.20.1 向け。
 */

include(Resources.id("jsblock:scripts/jrh_pids_common.js"));

const DEFAULT_COLOR_NAVY = 0x1D2053;
const COLOR_LED_WHITE = 0xFFFFFF;
const COLOR_TRACK_YELLOW = 0xFFFF00;
const COLOR_MESSAGE_YELLOW = 0xFFD900;
const MESSAGE_SWITCH_INTERVAL_MS = 6000;

function create(ctx, state, pids) {
}

function render(ctx, state, pids) {
    let w = pids.width;
    let h = pids.height;
    let sx = w / 160.0;
    let sy = h / 48.0;
    let unit = Math.min(sx, sy);
    const HEADER_HEIGHT = 14;
    const ROW_HEIGHT = 13;
    const ROW_GAP = 4;
    let backgroundColor = parseColor(SCRIPT_INPUT.backgroundColor, DEFAULT_COLOR_NAVY);
    let arrivalWarningSeconds = numberOrDefault(SCRIPT_INPUT.arrivalWarningSeconds, 25);
    let warningBlinkIntervalMs = numberOrDefault(SCRIPT_INPUT.arrivalWarningBlinkIntervalMs, 500);
    let currentTimeMs = new Date().getTime();
    let firstArrival = pids.arrivals().get(0);
    let arrivalWarningActive = !pids.isRowHidden(0) &&
        firstArrival != null &&
        firstArrival.arrivalTime() > currentTimeMs &&
        firstArrival.arrivalTime() - currentTimeMs <= arrivalWarningSeconds * 1000;
    let warningBlinkVisible = Math.floor(currentTimeMs / warningBlinkIntervalMs) % 2 == 0;

    // Display body and two equally-sized departure rows.
    rectangle(ctx, "Navy background", 0, 0, w, h, backgroundColor);
    rectangle(ctx, "Departure row 1", 5 * sx, HEADER_HEIGHT * sy, 150 * sx, ROW_HEIGHT * sy, COLOR_BLACK);
    rectangle(ctx, "Departure row 2", 5 * sx, (HEADER_HEIGHT + ROW_HEIGHT + ROW_GAP) * sy, 150 * sx, ROW_HEIGHT * sy, COLOR_BLACK);

    // The first message field in the PIDS configuration is used as the header.
    let headerMessage = pids.getCustomMessage(0);
    if(headerMessage == null || headerMessage.trim() == "") {
        headerMessage = SCRIPT_INPUT.directionText;
    }

    drawText(ctx, "Header message", primaryLanguage(headerMessage), COLOR_WHITE,
        7 * sx, 3 * sy, 146 * sx, 9, 1.05 * unit, "left", true);

    let secondMessage = pids.getCustomMessage(1);
    let hasSecondMessage = secondMessage != null && secondMessage.trim() != "";
    let secondRowHidden = pids.isRowHidden(1);
    let secondMessageText = primaryLanguage(secondMessage);
    let messageCycleDuration = MESSAGE_SWITCH_INTERVAL_MS * 2;
    let messageCycleElapsed = currentTimeMs % messageCycleDuration;
    let showAlternatingMessage = hasSecondMessage &&
        messageCycleElapsed >= MESSAGE_SWITCH_INTERVAL_MS;

    for(let row = 0; row < 2; row++) {
        let arrival = pids.arrivals().get(row);
        let rowY = (HEADER_HEIGHT + row * (ROW_HEIGHT + ROW_GAP)) * sy;

        // Arrival warning always takes priority over the second train and
        // the configured second message. During the invisible blink phase,
        // row 2 deliberately remains blank.
        if(row == 1 && arrivalWarningActive) {
            if(warningBlinkVisible) {
                drawText(ctx, "Arrival warning", SCRIPT_INPUT.arrivalWarningText, COLOR_RED,
                    7 * sx, rowY + 2 * sy, 146 * sx, 9, 1.08 * unit, "left", true);
            }
            continue;
        }

        // The second PIDS message controls the second display row.
        // If its "hide destination etc." option is enabled, always show the
        // message. Otherwise alternate it with the second train.
        if(row == 1 && hasSecondMessage && (secondRowHidden || showAlternatingMessage)) {
            drawMessageRow(ctx, secondMessageText, rowY, sx, sy, unit);
            continue;
        }

        if(arrival == null) {
            if(row == 0) {
                drawText(ctx, "No train", SCRIPT_INPUT.noTrainText, COLOR_GREEN,
                    7 * sx, rowY + 2 * sy, 146 * sx, 9, 1.08 * unit, "left", true);
            }
            continue;
        }

        drawArrivalRow(ctx, pids, arrival, row, rowY, sx, sy, unit);
    }
}

function dispose(ctx, state, pids) {
}

function numberOrDefault(value, fallback) {
    let number = Number(value);
    return isNaN(number) || number <= 0 ? fallback : number;
}

function drawArrivalRow(ctx, pids, arrival, row, rowY, sx, sy, unit) {
    let routeNumber = primaryLanguage(arrival.routeNumber());
    let departure = formatClock(arrival.departureTime());
    let destination = primaryLanguage(arrival.destination());
    let platform = primaryLanguage(arrival.platformName());
    let routeColor = arrival.routeColor();

    rectangle(ctx, "Route color " + row,
        6 * sx, rowY + 1 * sy, 52 * sx, 11 * sy, routeColor);

    drawText(ctx, "Route number " + row, routeNumber, COLOR_LED_WHITE,
        7 * sx, rowY + 2 * sy, 49 * sx, 9, 1.12 * unit, "left", true);

    drawText(ctx, "Departure " + row, departure, COLOR_LED_WHITE,
        65 * sx, rowY + 1 * sy, 27 * sx, 9, 1.32 * unit, "left", false);

    drawText(ctx, "Destination " + row, destination, COLOR_LED_WHITE,
        96 * sx, rowY + 2 * sy, 48 * sx, 9, 1.12 * unit, "left", true);

    if(!pids.isPlatformNumberHidden()) {
        drawText(ctx, "Platform " + row, platform, COLOR_TRACK_YELLOW,
            153 * sx, rowY + 1 * sy, 8 * sx, 9, 1.32 * unit, "right", false);
    }
}

function drawMessageRow(ctx, message, rowY, sx, sy, unit) {
    let scale = 1.08 * unit;
    Text.create("Second message")
        .text(message)
        .fontMC()
        .color(COLOR_MESSAGE_YELLOW)
        .pos(7 * sx, rowY + 2 * sy)
        .size((140 * sx) / scale, 9)
        .scale(scale)
        .leftAlign()
        .scaleXY()
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

    if(fit == "stretch") {
        text.stretchXY();
    } else if(fit) {
        text.scaleXY();
    }

    text.draw(ctx);
}
