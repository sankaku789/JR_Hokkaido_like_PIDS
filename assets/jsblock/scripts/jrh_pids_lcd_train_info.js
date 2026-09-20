/* コンコース用2段目の編成・停車駅案内。固定テキスト入力と同じスクロール速度を使う。 */

const jrhLcdOriginalDrawMessageRow = jrhLcdDrawMessageRow;
const jrhLcdTextWidthCache = {};

/**
 * 固定テキスト入力の描画関数を拡張する。
 * 28文字未満の通常メッセージは既存描画を維持し、
 * 長文と色付きセグメントは同じ固定速度スクロール処理を使う。
 */
jrhLcdDrawMessageRow = function(ctx, message, rowY, rowHeight, w, unit, theme, marqueeProgress) {
    if(!(message instanceof Array)) {
        let text = String(message == null ? "" : message);
        if(Array.from(text).length < MESSAGE_SCROLL_MIN_CHARS) {
            jrhLcdOriginalDrawMessageRow(ctx, text, rowY, rowHeight, w, unit, theme, marqueeProgress);
            return;
        }
        jrhLcdDrawFixedScrollMessageRow(
            ctx,
            [{text: text, color: theme.message}],
            rowY,
            rowHeight,
            w,
            unit,
            marqueeProgress
        );
        return;
    }

    jrhLcdDrawFixedScrollMessageRow(ctx, message, rowY, rowHeight, w, unit, marqueeProgress);
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
 * JCMのmarqueeを複数重ねず、1本のスクロール座標で全文を動かす。
 * getMessageMarqueeDuration() は固定テキスト入力と共通なのでスクロール速度も同じ。
 */
function jrhLcdDrawFixedScrollMessageRow(ctx, segments, rowY, rowHeight, w, unit, marqueeProgress) {
    let scale = 0.92 * unit;
    let textY = rowY + Math.max(0.5, (rowHeight - 9 * scale) / 2);
    let viewportX = 6;
    let viewportWidth = w - 20;
    let viewportRight = viewportX + viewportWidth;
    let glyphs = [];
    let fullMessage = "";
    let totalTextWidth = 0;

    for(let i = 0; i < segments.length; i++) {
        let segmentText = String(segments[i].text == null ? "" : segments[i].text);
        let color = segments[i].color;
        fullMessage += segmentText;

        let chars = Array.from(segmentText);
        for(let j = 0; j < chars.length; j++) {
            let charText = chars[j];
            let charWidth = jrhLcdMeasurePidsText(charText);
            glyphs.push({
                text: charText,
                color: color,
                width: charWidth
            });
            totalTextWidth += charWidth * scale;
        }
    }

    if(glyphs.length == 0) {
        return;
    }

    let startX = viewportX;
    if(Array.from(fullMessage).length >= MESSAGE_SCROLL_MIN_CHARS) {
        let duration = getMessageMarqueeDuration(fullMessage);
        let progress = marqueeProgress == null
            ? jrhLcdGetDefaultMarqueeProgress(duration)
            : Number(marqueeProgress);
        if(!isFinite(progress)) {
            progress = 0;
        }
        progress = Math.max(0, Math.min(1, progress));
        startX = viewportX + viewportWidth - (viewportWidth + totalTextWidth) * progress;
    }

    let x = startX;
    for(let i = 0; i < glyphs.length; i++) {
        let glyph = glyphs[i];
        let drawnWidth = glyph.width * scale;
        let glyphRight = x + drawnWidth;

        // 表示領域内に完全に入った文字だけ描画し、左右端からのはみ出しを防ぐ。
        if(x >= viewportX && glyphRight <= viewportRight) {
            createPidsText("LCD fixed scroll glyph " + i)
                .text(glyph.text)
                .color(glyph.color)
                .pos(x, textY)
                .size(Math.max(glyph.width, 1), 9)
                .scale(scale)
                .leftAlign()
                .draw(ctx);
        }

        x = glyphRight;
    }
}

/** 固定テキスト入力と同じゲームtick基準の進行率を返す。 */
function jrhLcdGetDefaultMarqueeProgress(durationSeconds) {
    let cycleDurationTicks = durationSeconds * 20;
    if(!isFinite(cycleDurationTicks) || cycleDurationTicks <= 0) {
        return 0;
    }
    let gameTick = Number(Packages.org.mtr.mod.InitClient.getGameTick());
    return (gameTick % cycleDurationTicks) / cycleDurationTicks;
}

/** PIDS用フォントでの文字幅を取得し、同じ文字はキャッシュする。 */
function jrhLcdMeasurePidsText(value) {
    let text = String(value == null ? "" : value);
    if(jrhLcdTextWidthCache[text] != null) {
        return jrhLcdTextWidthCache[text];
    }

    let width = 0;
    try {
        let mutableText = Packages.org.mtr.mapping.mapper.TextHelper.literal(text);
        let style = Packages.org.mtr.mapping.holder.Style.getEmptyMapped()
            .withFont(new Packages.org.mtr.mapping.holder.Identifier(PIDS_FONT));
        mutableText = Packages.org.mtr.mapping.mapper.TextHelper.setStyle(mutableText, style);
        width = Number(Packages.org.mtr.mapping.mapper.GraphicsHolder.getTextWidth(mutableText));
    } catch(e) {
        width = 0;
    }

    if(!isFinite(width) || width <= 0) {
        width = /[\x00-\x7F]/.test(text) ? 5 : 8;
    }
    jrhLcdTextWidthCache[text] = width;
    return width;
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
