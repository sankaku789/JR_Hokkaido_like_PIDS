/* MTR 4.0.5 / newer Core HTTP response compatibility.
 *
 * MTR 4.0.5のローカルHTTPプロキシではSystem Map APIのpayloadが直接返る環境がある。
 * 新しいCoreの{status,text,data} envelope形式と両方を受理する。
 */

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
        } else {
            // MTR 4.0.5系: endpoint payloadが直接返る。
            data = parsed;
        }

        jrhPreviousStationHttpUnavailableUntilMs = 0;
        jrhPreviousStationHttpClearFailure();
        return data;
    } catch(e) {
        jrhPreviousStationHttpLogFailure("core-http: exception for " + path + ": " + e);
        jrhPreviousStationHttpUnavailableUntilMs = currentTimeMs + jrhPreviousStationHttpFailureRetryMs;
        return null;
    }
};
