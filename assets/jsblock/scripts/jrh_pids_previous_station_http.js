/* JR北海道風ホーム発車標 前駅発車判定 - MTR Core HTTP通信。
 *
 * MTR/JCMのArrivalsCacheへ直接触れず、MTRのローカルHTTPプロキシ経由でCore APIを参照する。
 * このファイルはHTTP通信・レスポンス互換・短時間キャッシュだけを担当する。
 */

const jrhPreviousStationHttpRouteCacheTtlMs = 60 * 1000;
const jrhPreviousStationHttpArrivalRefreshMs = 1000;
const jrhPreviousStationHttpFailureRetryMs = 30 * 1000;
const jrhPreviousStationHttpConnectTimeoutMs = 500;
const jrhPreviousStationHttpReadTimeoutMs = 1500;
const jrhPreviousStationHttpMaxCountPerStation = 64;

let jrhPreviousStationHttpRoutesCache = null;
let jrhPreviousStationHttpRoutesExpiresAtMs = 0;
let jrhPreviousStationHttpUnavailableUntilMs = 0;
let jrhPreviousStationHttpLastFailure = null;
const jrhPreviousStationHttpStationCache = {};
const jrhPreviousStationHttpResponseModes = {};

function jrhPreviousStationHttpDimension() {
    let value = Number(SCRIPT_INPUT.previousStationHttpDimension);
    return isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function jrhPreviousStationHttpLogFailure(message) {
    let text = String(message);
    if(jrhPreviousStationHttpLastFailure == text) {
        return;
    }
    jrhPreviousStationHttpLastFailure = text;
    try {
        console.warn("[JRHPIDS previous-station] " + text);
    } catch(e) {
    }
}

function jrhPreviousStationHttpClearFailure() {
    jrhPreviousStationHttpLastFailure = null;
}

function jrhPreviousStationHttpLogResponseMode(path, mode) {
    if(jrhPreviousStationHttpResponseModes[path] == mode) {
        return;
    }
    jrhPreviousStationHttpResponseModes[path] = mode;
    try {
        console.warn("[JRHPIDS previous-station http] response path=" + path + " mode=" + mode);
    } catch(e) {
    }
}

function jrhPreviousStationHttpLocalPort() {
    try {
        let port = Number(Packages.org.mtr.mod.InitClient.getServerPort());
        return isFinite(port) && port > 0 ? Math.floor(port) : 0;
    } catch(e) {
        jrhPreviousStationHttpLogFailure("core-http: MTR local webserver port is unavailable: " + e);
        return 0;
    }
}

function jrhPreviousStationHttpBaseUrl() {
    let port = jrhPreviousStationHttpLocalPort();
    return port <= 0 ? null : "http://127.0.0.1:" + port;
}

/** MTR 4.0.5系と新しいCoreのレスポンス形式を共通payloadへ正規化する。 */
function jrhPreviousStationHttpExtractData(parsed, path, currentTimeMs) {
    if(parsed == null || typeof parsed != "object") {
        jrhPreviousStationHttpLogFailure("core-http: invalid JSON payload for " + path);
        jrhPreviousStationHttpUnavailableUntilMs = currentTimeMs + jrhPreviousStationHttpFailureRetryMs;
        return null;
    }

    if(parsed.status != null) {
        if(Number(parsed.status) != 200 || parsed.data == null) {
            jrhPreviousStationHttpLogFailure(
                "core-http: API error envelope (status=" + String(parsed.status) + ") for " + path);
            jrhPreviousStationHttpUnavailableUntilMs = currentTimeMs + jrhPreviousStationHttpFailureRetryMs;
            return null;
        }
        jrhPreviousStationHttpLogResponseMode(path, "status-data");
        return parsed.data;
    }

    // MTR 4.0.5実環境: {code:200,currentTime,text,version,data:{...}}
    if(parsed.code != null) {
        if(Number(parsed.code) != 200) {
            jrhPreviousStationHttpLogFailure(
                "core-http: API error response (code=" + String(parsed.code) + ") for " + path);
            jrhPreviousStationHttpUnavailableUntilMs = currentTimeMs + jrhPreviousStationHttpFailureRetryMs;
            return null;
        }
        if(parsed.data != null) {
            jrhPreviousStationHttpLogResponseMode(path, "code-data");
            return parsed.data;
        }
        jrhPreviousStationHttpLogResponseMode(path, "code-direct");
        return parsed;
    }

    // 一部の旧Core/プロキシ: status/codeなしのdata wrapper。
    if(parsed.data != null && parsed.routes == null && parsed.arrivals == null) {
        jrhPreviousStationHttpLogResponseMode(path, "data-wrapper");
        return parsed.data;
    }

    // endpoint payloadが直接返る形式。
    jrhPreviousStationHttpLogResponseMode(path, "direct");
    return parsed;
}

function jrhPreviousStationHttpRequest(path, body, currentTimeMs) {
    if(currentTimeMs < jrhPreviousStationHttpUnavailableUntilMs) {
        return null;
    }
    if(typeof Networking == "undefined") {
        jrhPreviousStationHttpLogFailure("core-http: JCM Networking API is unavailable");
        jrhPreviousStationHttpUnavailableUntilMs = currentTimeMs + jrhPreviousStationHttpFailureRetryMs;
        return null;
    }

    let baseUrl = jrhPreviousStationHttpBaseUrl();
    if(baseUrl == null) {
        jrhPreviousStationHttpLogFailure("core-http: MTR local webserver is not running");
        jrhPreviousStationHttpUnavailableUntilMs = currentTimeMs + jrhPreviousStationHttpFailureRetryMs;
        return null;
    }

    try {
        let request = {
            method: body == null ? "GET" : "POST",
            connectTimeout: jrhPreviousStationHttpConnectTimeoutMs,
            readTimeout: jrhPreviousStationHttpReadTimeoutMs,
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            }
        };
        if(body != null) {
            request.body = JSON.stringify(body);
        }

        let response = Networking.fetch(baseUrl + path, request);
        if(response == null) {
            jrhPreviousStationHttpLogFailure("core-http: empty Networking response for " + path);
            jrhPreviousStationHttpUnavailableUntilMs = currentTimeMs + jrhPreviousStationHttpFailureRetryMs;
            return null;
        }
        if(!response.ok() || response.getData() == null) {
            let code = -1;
            try {
                code = Number(response.getResponseCode());
            } catch(e) {
            }
            jrhPreviousStationHttpLogFailure("core-http: request failed (status=" + code + ") for " + path);
            jrhPreviousStationHttpUnavailableUntilMs = currentTimeMs + jrhPreviousStationHttpFailureRetryMs;
            return null;
        }

        let text = response.getData().asString();
        if(text == null || String(text).trim() == "") {
            jrhPreviousStationHttpLogFailure("core-http: empty response body for " + path);
            jrhPreviousStationHttpUnavailableUntilMs = currentTimeMs + jrhPreviousStationHttpFailureRetryMs;
            return null;
        }

        let data = jrhPreviousStationHttpExtractData(JSON.parse(String(text)), path, currentTimeMs);
        if(data == null) {
            return null;
        }

        jrhPreviousStationHttpUnavailableUntilMs = 0;
        jrhPreviousStationHttpClearFailure();
        return data;
    } catch(e) {
        jrhPreviousStationHttpLogFailure("core-http: exception for " + path + ": " + e);
        jrhPreviousStationHttpUnavailableUntilMs = currentTimeMs + jrhPreviousStationHttpFailureRetryMs;
        return null;
    }
}

function jrhPreviousStationHttpGetRoutes(currentTimeMs) {
    if(jrhPreviousStationHttpRoutesCache != null && currentTimeMs < jrhPreviousStationHttpRoutesExpiresAtMs) {
        return jrhPreviousStationHttpRoutesCache;
    }

    let data = jrhPreviousStationHttpRequest(
        "/mtr/api/map/stations-and-routes?dimension=" + jrhPreviousStationHttpDimension(),
        null,
        currentTimeMs);
    if(data == null || data.routes == null) {
        return null;
    }

    jrhPreviousStationHttpRoutesCache = data.routes;
    jrhPreviousStationHttpRoutesExpiresAtMs = currentTimeMs + jrhPreviousStationHttpRouteCacheTtlMs;
    return jrhPreviousStationHttpRoutesCache;
}

function jrhPreviousStationHttpGetStationArrivals(stationHex, currentTimeMs) {
    let cached = jrhPreviousStationHttpStationCache[stationHex];
    if(cached != null && currentTimeMs < cached.nextRefreshAtMs) {
        return cached;
    }

    let data = jrhPreviousStationHttpRequest(
        "/mtr/api/map/arrivals?dimension=" + jrhPreviousStationHttpDimension(),
        {
            stationIdsHex: [stationHex],
            maxCountPerPlatform: jrhPreviousStationHttpMaxCountPerStation,
            maxCountTotal: jrhPreviousStationHttpMaxCountPerStation
        },
        currentTimeMs);
    if(data == null) {
        return null;
    }

    let fetchedAtMs = new Date().getTime();
    let snapshot = {
        currentTime: Number(data.currentTime),
        arrivals: data.arrivals == null ? [] : data.arrivals,
        fetchedAtMs: fetchedAtMs,
        nextRefreshAtMs: fetchedAtMs + jrhPreviousStationHttpArrivalRefreshMs
    };
    if(!isFinite(snapshot.currentTime)) {
        jrhPreviousStationHttpLogFailure("core-http: arrivals response has invalid currentTime");
        return null;
    }

    jrhPreviousStationHttpStationCache[stationHex] = snapshot;
    return snapshot;
}

/** Core側時刻をクライアントのepoch時刻へ写像する。 */
function jrhPreviousStationHttpToLocalTime(serverTimeMs, snapshot) {
    let value = Number(serverTimeMs);
    if(!isFinite(value) || snapshot == null || !isFinite(snapshot.currentTime)) {
        return null;
    }
    return snapshot.fetchedAtMs + (value - snapshot.currentTime);
}
