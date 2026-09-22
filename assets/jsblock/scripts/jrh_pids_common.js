/* JR北海道風 PIDS 共通処理。 */

const COLOR_BLACK = 0x000000;
const COLOR_WHITE = 0xF4F4FF;
const COLOR_RED = 0xFF1800;
const COLOR_GREEN = 0x16FF35;
const COLOR_ORANGE = 0xFF9D00;
const COLOR_YELLOW = 0xFFFF00;
const WHITE_TEXTURE = "mtr:textures/block/white.png";
const PIDS_FONT = "jsblock:unifont";
const LANGUAGE_SWITCH_INTERVAL_MS = 5000;
const MESSAGE_SCROLL_MIN_CHARS = 28;
const MESSAGE_MARQUEE_VIEWPORT_CHARS = 15;
const MESSAGE_MARQUEE_SECONDS_PER_CHARACTER = 0.33;
const JRH_ROUTE_METADATA_CACHE_TTL_MS = 10000;
const JRH_COMMON_CACHE_CLEANUP_INTERVAL_MS = 60 * 1000;
const jrhPreviousStationStateKeepMs = 60 * 1000;

const jrhRoutePlatformMetadataCache = {};
const jrhDestinationMatchCache = {};
let jrhCommonCacheNextCleanupMs = 0;
let jrhConfiguredTheme = null;

/** nullを空文字へ正規化する。 */
function jrhText(value) {
    return value == null ? "" : String(value);
}

/** 期限切れの共通metadata cacheを低頻度で破棄する。 */
function jrhCleanupCommonCaches(currentTimeMs) {
    if(currentTimeMs < jrhCommonCacheNextCleanupMs) {
        return;
    }
    jrhCommonCacheNextCleanupMs = currentTimeMs + JRH_COMMON_CACHE_CLEANUP_INTERVAL_MS;

    for(let key in jrhRoutePlatformMetadataCache) {
        let cached = jrhRoutePlatformMetadataCache[key];
        if(cached == null || currentTimeMs >= cached.expiresAtMs) {
            delete jrhRoutePlatformMetadataCache[key];
        }
    }
    for(let key in jrhDestinationMatchCache) {
        let cached = jrhDestinationMatchCache[key];
        if(cached == null || currentTimeMs >= cached.expiresAtMs) {
            delete jrhDestinationMatchCache[key];
        }
    }
}

/** ScriptInputの真偽値を解釈する。 */
function booleanOrDefault(value, fallback) {
    if(value == null) {
        return fallback;
    }
    if(typeof value == "boolean") {
        return value;
    }
    let text = String(value).trim().toLowerCase();
    if(text == "true" || text == "1" || text == "on" || text == "enabled" || text == "有効") {
        return true;
    }
    if(text == "false" || text == "0" || text == "off" || text == "disabled" || text == "無効") {
        return false;
    }
    return fallback;
}

/** 通常色・フルカラーの既存配色をScriptInputのモードから復元する。 */
function jrhGetConfiguredTheme() {
    if(jrhConfiguredTheme != null) {
        return jrhConfiguredTheme;
    }

    let fullColor = booleanOrDefault(SCRIPT_INPUT.fullColorMode, false);
    if(fullColor) {
        jrhConfiguredTheme = {
            background: parseColor(SCRIPT_INPUT.backgroundColor, 0x1D2053),
            showRouteColor: true,
            header: COLOR_WHITE,
            noTrain: COLOR_GREEN,
            warning: COLOR_RED,
            route: 0xFFFFFF,
            departure: 0xFFFFFF,
            destination: 0xFFFFFF,
            platform: COLOR_YELLOW,
            message: COLOR_GREEN,
            stops: COLOR_GREEN,
            outOfService: 0xFFFFFF
        };
    } else {
        jrhConfiguredTheme = {
            background: parseColor(SCRIPT_INPUT.backgroundColor, 0x05051F),
            showRouteColor: false,
            header: COLOR_WHITE,
            noTrain: COLOR_GREEN,
            warning: COLOR_RED,
            route: COLOR_GREEN,
            departure: COLOR_GREEN,
            destination: COLOR_GREEN,
            platform: COLOR_ORANGE,
            message: COLOR_GREEN,
            stops: COLOR_GREEN,
            outOfService: COLOR_GREEN
        };
    }
    return jrhConfiguredTheme;
}

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

/** 前駅案内の診断ログを同一PIDS state内で重複抑制する。 */
function jrhPreviousStationDebug(state, key, message) {
    if(state.jrhPreviousStationDebug == null) {
        state.jrhPreviousStationDebug = {};
    }
    if(state.jrhPreviousStationDebug[key] == message) {
        return;
    }
    state.jrhPreviousStationDebug[key] = message;
    console.debug("[JRHPIDS previous-station] " + message);
}

/** 前駅発車時刻と表示状態を保持するPIDSインスタンスstateを返す。 */
function getPreviousStationDepartureStore(state) {
    if(state.jrhPreviousStationDepartures == null) {
        state.jrhPreviousStationDepartures = {};
    }
    return state.jrhPreviousStationDepartures;
}

/** Arrivalの補正時刻を含めず、同じ便を継続追跡するキーを作る。 */
function getPreviousStationServiceKey(arrival) {
    return String(arrival.departureIndex()) + ":" +
        String(arrival.routeId()) + ":" +
        String(arrival.platformId()) + ":" +
        String(arrival.carCount());
}

/** 指定Arrivalの保存済み前駅発車状態を返す。 */
function getPreviousStationDepartureRecord(arrival, state) {
    if(arrival == null || arrival.terminating() || state.jrhPreviousStationDepartures == null) {
        return null;
    }
    let record = state.jrhPreviousStationDepartures[getPreviousStationServiceKey(arrival)];
    return record == null ? null : record;
}

/** 指定Arrivalの前駅発車状態を取得し、未作成なら初期化する。 */
function jrhGetOrCreatePreviousStationDepartureRecord(arrival, state, currentTimeMs) {
    let store = getPreviousStationDepartureStore(state);
    let key = getPreviousStationServiceKey(arrival);
    let record = store[key];
    if(record == null) {
        record = {
            departureTimeMs: null,
            trackedDepartureTimeMs: null,
            departureLocked: false,
            displayStartedAtMs: null,
            displayCompleted: false,
            source: null,
            lastSeenAtMs: currentTimeMs,
            lastHttpSeenAtMs: null
        };
        store[key] = record;
    }
    record.lastSeenAtMs = currentTimeMs;
    return record;
}

/** 前駅案内stateから長時間見えていない便を除去する。 */
function jrhCleanupPreviousStationDepartureStore(state, currentTimeMs) {
    let store = getPreviousStationDepartureStore(state);
    for(let key in store) {
        let record = store[key];
        if(record == null || currentTimeMs - record.lastSeenAtMs > jrhPreviousStationStateKeepMs) {
            delete store[key];
            if(state.jrhPreviousStationDebug != null) {
                delete state.jrhPreviousStationDebug[key];
            }
        }
    }
}

/** 前駅判定スクリプトが無い場合は案内だけを無効化するfail-safe。 */
function updatePreviousStationDepartureCache(arrivals, state, currentTimeMs) {
}

/** MTRのroute ID mapからArrivalのrouteを取得する。 */
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

/** route・現在platformから導出できる情報を短時間共有する。 */
function jrhGetRoutePlatformMetadata(arrival, currentTimeMs) {
    if(arrival == null) {
        return null;
    }

    let now = currentTimeMs == null ? new Date().getTime() : Number(currentTimeMs);
    jrhCleanupCommonCaches(now);
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
    jrhCleanupCommonCaches(currentTimeMs);
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

/** 系統番号がnullまたは空文字でないか判定する。 */
function jrhRouteNumberIsPresent(routeNumber) {
    return routeNumber != null && String(routeNumber).trim() != "";
}

/** ScriptInputの遅れ表示設定を判定する。 */
function jrhDelayDisplayEnabled() {
    return booleanOrDefault(SCRIPT_INPUT.delayDisplayEnabled, false);
}

/** 遅れ表示設定に応じた表示用発車時刻を返す。 */
function jrhDisplayDepartureTime(arrival) {
    let departureTime = Number(arrival.departureTime());
    if(jrhDelayDisplayEnabled()) {
        return departureTime;
    }

    let deviation = Number(arrival.deviation());
    if(!isFinite(deviation)) {
        deviation = 0;
    }
    return departureTime - deviation;
}

/** 2分以上遅れている列車では、設定が有効な場合だけ遅延時間を交互表示する。 */
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

/** 文字数から一定速度に近いメッセージスクロール時間を算出する。 */
function getMessageMarqueeDuration(message) {
    let scrollDistanceInCharacters = MESSAGE_MARQUEE_VIEWPORT_CHARS + Array.from(message).length;
    let secondsPerCharacter = numberOrDefault(
        SCRIPT_INPUT.messageMarqueeSecondsPerCharacter,
        MESSAGE_MARQUEE_SECONDS_PER_CHARACTER);
    return scrollDistanceInCharacters * secondsPerCharacter;
}

/** 表示に必要な上位件数だけを発車時刻順で取得する。 */
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
        while(insertAt > 0 && Number(result[insertAt - 1].departureTime()) > departureTime) {
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
