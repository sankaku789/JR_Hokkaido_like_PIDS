/* コンコース用2段目の編成・停車駅案内。固定テキスト入力と同じスクロール速度を使う。 */

const jrhLcdOriginalDrawMessageRow = jrhLcdDrawMessageRow;

/**
 * 固定テキスト入力の描画関数を拡張し、色付きセグメント配列にも対応する。
 * 通常の文字列入力は既存実装をそのまま呼ぶ。
 */
jrhLcdDrawMessageRow = function(ctx, message, rowY, rowHeight, w, unit, theme, marqueeProgress) {
    if(!(message instanceof Array)) {
        jrhLcdOriginalDrawMessageRow(ctx, message, rowY, rowHeight, w, unit, theme, marqueeProgress);
        return;
    }
    jrhLcdDrawSegmentedMessageRow(ctx, message, rowY, rowHeight, w, unit, marqueeProgress);
};

/** 編成案内は緑、停車駅案内はオレンジで一続きに表示する。 */
function jrhLcdDrawStopsRow(ctx, arrival, set, rowY, rowHeight, w, unit, theme, languageIndex) {
    let parts = jrhLcdGetTrainInfoParts(arrival, languageIndex);
    let segments = [
        {text: parts.formation, color: COLOR_GREEN}
    ];
    if(parts.stops != "") {
        segments.push({text: parts.stops, color: COLOR_ORANGE});
    }
    jrhLcdDrawMessageRow(ctx, segments, rowY, rowHeight, w, unit, theme, null);
}

/**
 * 固定テキスト入力と同じ getMessageMarqueeDuration() を使い、
 * 複数色の各セグメントを1本の文字列として同じ位置・速度でスクロールさせる。
 */
function jrhLcdDrawSegmentedMessageRow(ctx, segments, rowY, rowHeight, w, unit, marqueeProgress) {
    let scale = 0.92 * unit;
    let textY = rowY + Math.max(0.5, (rowHeight - 9 * scale) / 2);
    let viewportWidth = (w - 20) / scale;
    let fullMessage = "";
    let widths = [];
    let totalWidth = 0;

    for(let i = 0; i < segments.length; i++) {
        let segmentText = String(segments[i].text == null ? "" : segments[i].text);
        segments[i].text = segmentText;
        fullMessage += segmentText;
        let width = jrhLcdMeasurePidsText(segmentText);
        widths.push(width);
        totalWidth += width;
    }

    if(Array.from(fullMessage).length < MESSAGE_SCROLL_MIN_CHARS) {
        let x = 6;
        for(let i = 0; i < segments.length; i++) {
            if(segments[i].text == "") {
                continue;
            }
            createPidsText("LCD train info segment " + i)
                .text(segments[i].text)
                .color(segments[i].color)
                .pos(x, textY)
                .size(Math.max(widths[i], 1), 9)
                .scale(scale)
                .leftAlign()
                .draw(ctx);
            x += widths[i] * scale;
        }
        return;
    }

    let duration = getMessageMarqueeDuration(fullMessage);
    let progress = marqueeProgress == null
        ? jrhLcdGetDefaultMarqueeProgress(duration)
        : marqueeProgress;
    let travelWidth = viewportWidth + totalWidth;
    let prefixWidth = 0;

    for(let i = 0; i < segments.length; i++) {
        let segmentText = segments[i].text;
        let segmentWidth = widths[i];
        if(segmentText == "" || segmentWidth <= 0) {
            prefixWidth += segmentWidth;
            continue;
        }

        // JCM marqueeの座標式を逆算し、各色セグメントを連続した1本の文章として配置する。
        let segmentProgress =
            (travelWidth * progress - prefixWidth) / (viewportWidth + segmentWidth);

        createPidsText("LCD train info segment " + i)
            .text(segmentText)
            .color(segments[i].color)
            .pos(6, textY)
            .size(viewportWidth, 9)
            .scale(scale)
            .leftAlign()
            .marquee(duration)
            .withMarqueeProgress(segmentProgress)
            .draw(ctx);

        prefixWidth += segmentWidth;
    }
}

/** 固定テキスト入力の通常marqueeと同じゲームtick基準の進行率を返す。 */
function jrhLcdGetDefaultMarqueeProgress(durationSeconds) {
    let cycleDurationTicks = durationSeconds * 20;
    if(!isFinite(cycleDurationTicks) || cycleDurationTicks <= 0) {
        return 0;
    }
    let gameTick = Number(Packages.org.mtr.mod.InitClient.getGameTick());
    return (gameTick % cycleDurationTicks) / cycleDurationTicks;
}

/** PIDS用フォントでの文字列幅を取得する。取得できない場合は概算値へフォールバックする。 */
function jrhLcdMeasurePidsText(value) {
    let text = String(value == null ? "" : value);
    try {
        let mutableText = Packages.org.mtr.mapping.mapper.TextHelper.literal(text);
        let style = Packages.org.mtr.mapping.holder.Style.getEmptyMapped()
            .withFont(new Packages.org.mtr.mapping.holder.Identifier(PIDS_FONT));
        mutableText = Packages.org.mtr.mapping.mapper.TextHelper.setStyle(mutableText, style);
        let width = Number(Packages.org.mtr.mapping.mapper.GraphicsHolder.getTextWidth(mutableText));
        if(isFinite(width) && width >= 0) {
            return width;
        }
    } catch(e) {
        // フォント幅取得が利用できない環境では下の概算へフォールバックする。
    }
    return Array.from(text).length * 8;
}

/** 先発列車の編成案内と、現在駅より先の停車駅案内を作る。 */
function jrhLcdGetTrainInfoParts(arrival, languageIndex) {
    let carCount = Number(arrival.carCount());
    if(!isFinite(carCount) || carCount < 0) {
        carCount = 0;
    }

    let names = [];
    let route = arrival.route();
    if(route != null) {
        let platforms = route.getPlatforms();
        let currentIndex = route.getPlatformIndex(arrival.platformId());
        let startIndex = currentIndex < 0 ? 0 : currentIndex + 1;
        let previousName = "";
        for(let i = startIndex; i < platforms.size(); i++) {
            let name = currentLanguage(platforms.get(i).getStationName(), languageIndex);
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

    return {
        formation: "この列車は" + carCount + "両編成です。",
        stops: names.length > 0 ? "停車駅は" + names.join("・") + "です。" : ""
    };
}
