/*
 * JR北海道風 PIDS 共通定数
 */

const COLOR_BLACK = 0x000000;
const COLOR_WHITE = 0xF4F4FF;
const COLOR_RED = 0xFF1800;
const COLOR_GREEN = 0x16FF35;
const COLOR_ORANGE = 0xFF9D00;
const WHITE_TEXTURE = "mtr:textures/block/white.png";
const PIDS_FONT = "jsblock:unifont";

/** PIDS用フォントを設定したテキストオブジェクトを作成する。 */
function createPidsText(comment) {
    return Text.create(comment).font(PIDS_FONT);
}

/** 多言語文字列から先頭言語の表示値を取り出す。 */
function primaryLanguage(value) {
    if(value == null) {
        return "";
    }
    let text = value.toString();
    let separator = text.indexOf("|");
    return (separator < 0 ? text : text.substring(0, separator)).trim();
}

/** エポック時刻を時刻表示（時:分）へ整形する。 */
function formatClock(epochMillis) {
    let date = new Date(epochMillis);
    return pad2(date.getHours()) + ":" + pad2(date.getMinutes());
}

/** 数値を2桁のゼロ埋め文字列へ変換する。 */
function pad2(value) {
    return value < 10 ? "0" + value : value.toString();
}

/** 色指定文字列を数値化し、無効時は既定値を返す。 */
function parseColor(value, fallback) {
    if(value == null) {
        return fallback;
    }
    let text = value.toString().replace("#", "").replace("0x", "");
    let color = parseInt(text, 16);
    return isNaN(color) ? fallback : color;
}

/** 指定色の矩形をテクスチャとして描画する。 */
function rectangle(ctx, comment, x, y, width, height, color) {
    Texture.create(comment)
        .texture(WHITE_TEXTURE)
        .color(color)
        .pos(x, y)
        .size(width, height)
        .draw(ctx);
}

/** 数値を検証し、正の値でない場合はフォールバックを返す。 */
function numberOrDefault(value, fallback) {
    let number = Number(value);
    return isNaN(number) || number <= 0 ? fallback : number;
}

/** 指定位置・色・整列でテキストを描画する。 */
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

    if(fit == "stretch") {
        text.stretchXY();
    } else if(fit) {
        text.scaleXY();
    }

    text.draw(ctx);
}
