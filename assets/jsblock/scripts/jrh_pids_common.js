/*
 * JR北海道風 PIDS 共通定数
 */

const COLOR_BLACK = 0x000000;
const COLOR_WHITE = 0xF4F4FF;
const COLOR_RED = 0xFF1800;
const COLOR_GREEN = 0x16FF35;
const COLOR_ORANGE = 0xFF9D00;
const WHITE_TEXTURE = "mtr:textures/block/white.png";

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
