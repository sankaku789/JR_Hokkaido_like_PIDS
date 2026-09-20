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
const LANGUAGE_SWITCH_INTERVAL_MS = 5000;
const MESSAGE_SCROLL_MIN_CHARS = 28;
const MESSAGE_MARQUEE_VIEWPORT_CHARS = 15;
const MESSAGE_MARQUEE_SECONDS_PER_CHARACTER = 0.33;
const JRH_ROUTE_METADATA_CACHE_TTL_MS = 10000;

const jrhRoutePlatformMetadataCache = {};
const jrhDestinationMatchCache = {};

/** PIDS用フォントを設定したテキストオブジェクトを作成する。 */
function createPidsText(comment) {
    return Text.create(comment).font(PIDS_FONT);
}

/** 多言語文字列から現在の表示言語を取り出す。 */
function currentLanguage(value, languageIndex) {
    if(value == null) {
        return "";
    }
    let parts = String(value).split("|");
    return parts[languageIndex % parts.length].trim();
}

/**
 * MTRのroute ID mapからArrivalのrouteを取得する。
 * map APIが利用できない環境では従来のArrivalWrapper.route()へフォールバックする。
 */
function jrhGetRoute(arrival) {
    if(arrival == null) {
        return null;
    }
    try {
        let route = MTRClientData.getInstance().simplifiedRouteIdMap.get(arrival.routeId());
        if(route != null) {
            return route;
        }
    } catch(e) {
    }
    return arrival.route();
}

/**
 * route・現在platformから導出できる不変寄りの情報を短時間共有する。
 * route編集への追従を残すため、一定時間で再構築する。
 */
function jrhGetRoutePlatformMetadata(arrival, currentTimeMs) {
    if(arrival == null) {
        return null;
    }

    let now = currentTimeMs == null ? new Date().getTime() : Number(currentTimeMs);
    let routeId = String(arrival.routeId());
    let platformId = String(arrival.platformId());
    let key = "r" + routeId + ":p" + platformId;
    let cached = jrhRoutePlatformMetadataCache[key];
    if(cached != null && now < cached.expiresAtMs) {
        return cached;
    }

    let route = jrhGetRoute(arrival);
    if(route == null) {
        return null;
    }

    let platforms = route.getPlatforms();
    let currentIndex = route.getPlatformIndex(arrival.platformId());
    let previousPlatformId = null;
    if(currentIndex > 0) {
        let previousPlatform = platforms.get(currentIndex - 1);
        if(previousPlatform != null) {
            previousPlatformId = previousPlatform.getPlatformId();
        }
    }

    let followingStationNames = [];
    let startIndex = currentIndex < 0 ? 0 : currentIndex + 1;
    for(let i = startIndex; i < platforms.size(); i++) {
        let platform = platforms.get(i);
        if(platform != null) {
            followingStationNames.push(String(platform.getStationName()));
        }
    }

    cached = {
        previousPlatformId: previousPlatformId,
        followingStationNames: followingStationNames,
        expiresAtMs: now + JRH_ROUTE_METADATA_CACHE_TTL_MS
    };
    jrhRoutePlatformMetadataCache[key] = cached;
    return cached;
}

/** route上の駅名から行き先の多言語文字列を補完する。 */
function currentDestination(arrival, languageIndex) {
    let destinationValue = arrival.destination();
    if(destinationValue == null) {
        return "";
    }

    let destination = String(destinationValue).trim();
    let routeId = String(arrival.routeId());
    let cacheKey = "r" + routeId + ":d" + destination;
    let currentTimeMs = new Date().getTime();
    let cached = jrhDestinationMatchCache[cacheKey];
    if(cached != null && currentTimeMs < cached.expiresAtMs) {
        return currentLanguage(cached.value, languageIndex);
    }

    let destinationParts = destination.split("|");
    for(let i = 0; i < destinationParts.length; i++) {
        destinationParts[i] = destinationParts[i].trim().toLowerCase();
    }

    let matchedValue = destination;
    let route = jrhGetRoute(arrival);
    if(route != null) {
        let platforms = route.getPlatforms();
        search:
        for(let i = 0; i < platforms.size(); i++) {
            let stationName = String(platforms.get(i).getStationName());
            let parts = stationName.split("|");
            for(let j = 0; j < parts.length; j++) {
                let normalizedStationName = parts[j].trim().toLowerCase();
                for(let k = 0; k < destinationParts.length; k++) {
                    if(destinationParts[k] == normalizedStationName) {
                        matchedValue = stationName;
                        break search;
                    }
                }
            }
        }
    }

    jrhDestinationMatchCache[cacheKey] = {
        value: matchedValue,
        expiresAtMs: currentTimeMs + JRH_ROUTE_METADATA_CACHE_TTL_MS
    };
    return currentLanguage(matchedValue, languageIndex);
}

/** 2分以上遅れている列車では、行き先と遅延時間を交互に返す。 */
function currentDestinationOrDelay(arrival, languageIndex, showDelay) {
    let deviation = arrival.deviation();
    if(!showDelay || deviation < 2 * 60 * 1000) {
        return currentDestination(arrival, languageIndex);
    }

    if(deviation >= 120 * 60 * 1000) {
        return currentLanguage("遅れ120分以上|120 minutes over", languageIndex);
    }

    let delayMinutes = Math.floor(deviation / 60000);
    return currentLanguage("遅れ約" + delayMinutes + "分|" + delayMinutes + " minutes behind", languageIndex);
}

/** 文字数から一定速度に近いメッセージスクロール時間を算出する。 */
function getMessageMarqueeDuration(message) {
    let scrollDistanceInCharacters = MESSAGE_MARQUEE_VIEWPORT_CHARS + Array.from(message).length;
    let secondsPerCharacter = numberOrDefault(
        SCRIPT_INPUT.messageMarqueeSecondsPerCharacter,
        MESSAGE_MARQUEE_SECONDS_PER_CHARACTER);
    return scrollDistanceInCharacters * secondsPerCharacter;
}

/** 到着情報をコピーし、発車時刻順のJavaScript配列として返す。 */
function getArrivalsByDepartureTime(pids, excludeTerminating) {
    let result = [];
    let source = pids.arrivals();
    // ArrivalEntriesにsize()がないためnull終端まで走査する。
    for(let i = 0; ; i++) {
        let arrival = source.get(i);
        if(arrival == null) {
            break;
        }
        if(excludeTerminating && arrival.terminating()) {
            continue;
        }
        result.push(arrival);
    }
    result.sort((a, b) => a.departureTime() - b.departureTime());
    return result;
}

/**
 * 表示に必要な上位件数だけを発車時刻順で取得する。
 * 同一時刻では元のArrival順を維持し、全件sortを避ける。
 */
function getTopArrivalsByDepartureTime(pids, excludeTerminating, limit) {
    let result = [];
    if(limit <= 0) {
        return result;
    }

    let source = pids.arrivals();
    for(let i = 0; ; i++) {
        let arrival = source.get(i);
        if(arrival == null) {
            break;
        }
        if(excludeTerminating && arrival.terminating()) {
            continue;
        }

        let departureTime = Number(arrival.departureTime());
        let insertAt = result.length;
        while(insertAt > 0 &&
            Number(result[insertAt - 1].departureTime()) > departureTime) {
            insertAt--;
        }

        if(insertAt < limit) {
            result.splice(insertAt, 0, arrival);
            if(result.length > limit) {
                result.pop();
            }
        }
    }
    return result;
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
