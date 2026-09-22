/* MTR 4.0.5 / newer Core HTTP response compatibility.
 *
 * MTR 4.0.5のローカルHTTPプロキシではSystem Map APIのpayloadが直接返る環境がある。
 * 新しいCoreの{status,text,data} envelope形式と両方を受理する。
 */

const jrhPreviousStationHttpCompatDiagLast = new Packages.java.util.concurrent.ConcurrentHashMap();

function jrhPreviousStationHttpCompatDiag(key, message) {
    try {
        let text = String(message);
        let previous = jrhPreviousStationHttpCompatDiagLast.put(String(key), text);
        if(previous == null || String(previous) != text) {
            console.warn("[JRHPIDS previous-station http] " + text);
        }
    } catch(e) {
    }
}

function jrhPreviousStationHttpCompatDescribe(value) {
    try {
        if(value == null) return "null";
        if(Array.isArray(value)) return "array(length=" + value.length + ")";
        if(typeof value != "object") return typeof value + "(" + String(value) + ")";
        let keys = Object.keys(value);
        let parts = [];
        for(let i = 0; i < keys.length && i < 20; i++) {
            let key = keys[i];
            let child = value[key];
            if(Array.isArray(child)) {
                parts.push(key + "[]=len" + child.length);
            } else if(child != null && typeof child == "object") {
                parts.push(key + "={" + Object.keys(child).slice(0, 8).join(",") + "}");
            } else {
                let childText = String(child);
                if(childText.length > 80) childText = childText.substring(0, 80) + "...";
                parts.push(key + "=" + childText);
            }
        }
        return "object{" + parts.join(";") + "}";
    } catch(e) {
        return "describe-error=" + e;
    }
}

jrhPreviousStationHttpRequest = function(path, body, currentTimeMs) {
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
            jrhPreviousStationHttpLogFailure(
                "core-http: request failed (status=" + code + ") for " + path);
            jrhPreviousStationHttpUnavailableUntilMs = currentTimeMs + jrhPreviousStationHttpFailureRetryMs;
            return null;
        }

        let text = response.getData().asString();
        if(text == null || String(text).trim() == "") {
            jrhPreviousStationHttpLogFailure("core-http: empty response body for " + path);
            jrhPreviousStationHttpUnavailableUntilMs = currentTimeMs + jrhPreviousStationHttpFailureRetryMs;
            return null;
        }

        let parsed = JSON.parse(String(text));
        if(parsed == null || typeof parsed != "object") {
            jrhPreviousStationHttpLogFailure("core-http: invalid JSON payload for " + path);
            jrhPreviousStationHttpUnavailableUntilMs = currentTimeMs + jrhPreviousStationHttpFailureRetryMs;
            return null;
        }

        jrhPreviousStationHttpCompatDiag(
            "raw:" + path,
            "response path=" + path + " raw=" + jrhPreviousStationHttpCompatDescribe(parsed));

        let data = null;
        if(parsed.status != null) {
            // 新しいCore: {status, text, data}
            if(Number(parsed.status) != 200 || parsed.data == null) {
                jrhPreviousStationHttpLogFailure(
                    "core-http: API error envelope (status=" + String(parsed.status) + ") for " + path);
                jrhPreviousStationHttpUnavailableUntilMs = currentTimeMs + jrhPreviousStationHttpFailureRetryMs;
                return null;
            }
            data = parsed.data;
        } else if(parsed.data != null && parsed.routes == null && parsed.arrivals == null) {
            // 一部のMTRローカルプロキシ/旧Coreでstatusなしdata wrapperになっている場合。
            data = parsed.data;
            jrhPreviousStationHttpCompatDiag(
                "unwrap:" + path,
                "response path=" + path + " using status-less data wrapper: " +
                jrhPreviousStationHttpCompatDescribe(data));
        } else {
            // MTR 4.0.5系: endpoint payloadが直接返る。
            data = parsed;
        }

        jrhPreviousStationHttpCompatDiag(
            "data:" + path,
            "response path=" + path + " data=" + jrhPreviousStationHttpCompatDescribe(data));

        jrhPreviousStationHttpUnavailableUntilMs = 0;
        jrhPreviousStationHttpClearFailure();
        return data;
    } catch(e) {
        jrhPreviousStationHttpLogFailure("core-http: exception for " + path + ": " + e);
        jrhPreviousStationHttpUnavailableUntilMs = currentTimeMs + jrhPreviousStationHttpFailureRetryMs;
        return null;
    }
};
