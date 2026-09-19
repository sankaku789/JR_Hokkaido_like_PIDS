/* JR北海道風PIDSの表示ルール上書き。 */

/** 系統番号がnullまたは空文字でないか判定する。 */
function jrhRouteNumberIsPresent(routeNumber) {
    return routeNumber != null && String(routeNumber).trim() != "";
}

/** scriptInputの遅れ表示設定を判定する。未指定時は無効。 */
function jrhDelayDisplayEnabled() {
    let value = SCRIPT_INPUT.delayDisplayEnabled;
    if(value == null) {
        return false;
    }
    if(typeof value == "boolean") {
        return value;
    }
    let text = String(value).trim().toLowerCase();
    return text == "true" || text == "1" || text == "on" || text == "enabled" || text == "有効";
}

/** 2分以上遅れている列車では、設定が有効な場合だけ行き先と遅延時間を交互に返す。 */
function currentDestinationOrDelay(arrival, languageIndex, showDelay) {
    let deviation = Number(arrival.deviation());
    if(!jrhDelayDisplayEnabled() || !showDelay || deviation < 2 * 60 * 1000) {
        return currentDestination(arrival, languageIndex);
    }

    if(deviation >= 120 * 60 * 1000) {
        return currentLanguage("遅れ120分以上|120 minutes over", languageIndex);
    }

    let delayMinutes = Math.floor(deviation / 60000);
    return currentLanguage("遅れ約" + delayMinutes + "分|" + delayMinutes + " minutes behind", languageIndex);
}

/** 現在の表示フェーズで遅れ案内を表示しているか判定する。 */
function jrhIsDelayVisible(arrival, showDelay) {
    if(arrival == null || !jrhDelayDisplayEnabled() || !showDelay) {
        return false;
    }
    return Number(arrival.deviation()) >= 2 * 60 * 1000;
}

/**
 * ホーム発車標の列車情報1行を描画する。
 * FCでは系統番号が空のときだけ路線色背景を描画せず、遅れ表示は赤にする。
 */
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

/**
 * LCD発車標の列車情報1行を描画する。
 * FCでは系統番号が空のときだけ路線色背景を描画せず、遅れ表示は赤にする。
 */
function jrhLcdDrawArrivalRow(ctx, pids, arrival, set, rowY, rowHeight, w, unit, theme, languageIndex, showDelay) {
    let routeNumber = currentLanguage(arrival.routeNumber(), languageIndex);
    let departure = formatClock(arrival.departureTime());
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
