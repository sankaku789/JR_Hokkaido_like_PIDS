/* JR北海道風ホーム発車標 前駅発車判定（MTR Core HTTP API）。
 *
 * MTR/JCMのArrivalsCacheへ直接触れず、MTRのローカルHTTPプロキシ経由でCore APIを参照する。
 * HTTPが無効・応答不能・同一便を確認できない場合は、前駅案内を表示しない。
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
const jrhPreviousStationHttpRouteLocationCache = {};

function jrhPreviousStationHttpText(value) {
    return value == null ? "" : String(value);
}

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

        let envelope = JSON.parse(String(text));
        if(envelope == null || Number(envelope.status) != 200 || envelope.data == null) {
            let status = envelope == null ? "null" : String(envelope.status);
            jrhPreviousStationHttpLogFailure("core-http: invalid API envelope (status=" + status + ") for " + path);
            jrhPreviousStationHttpUnavailableUntilMs = currentTimeMs + jrhPreviousStationHttpFailureRetryMs;
            return null;
        }

        jrhPreviousStationHttpUnavailableUntilMs = 0;
        jrhPreviousStationHttpClearFailure();
        return envelope.data;
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

function jrhPreviousStationHttpCurrentStationHex(arrival) {
    try {
        let platform = arrival.platform();
        if(platform != null && platform.area != null) {
            return String(platform.area.getHexId());
        }
    } catch(e) {
    }
    return null;
}

function jrhPreviousStationHttpRouteExactMatch(httpRoute, arrival) {
    if(httpRoute == null) {
        return false;
    }
    return jrhPreviousStationHttpText(httpRoute.name) == jrhPreviousStationHttpText(arrival.routeName()) &&
        Number(httpRoute.color) == Number(arrival.routeColor()) &&
        jrhPreviousStationHttpText(httpRoute.number) == jrhPreviousStationHttpText(arrival.routeNumber());
}

function jrhPreviousStationHttpRouteLooseMatch(httpRoute, arrival) {
    if(httpRoute == null) {
        return false;
    }
    return jrhPreviousStationHttpText(httpRoute.name) == jrhPreviousStationHttpText(arrival.routeName()) &&
        Number(httpRoute.color) == Number(arrival.routeColor());
}

/**
 * JCM側SimplifiedRouteの現在platform indexを基準に、Core HTTP route上の現在駅と前駅を特定する。
 * 64bit route/platform IDをJSON Numberへ変換して照合しない。
 */
function jrhPreviousStationHttpResolveRouteLocation(arrival, currentTimeMs) {
    let cacheKey = String(arrival.routeId()) + ":" + String(arrival.platformId());
    let cached = jrhPreviousStationHttpRouteLocationCache[cacheKey];
    if(cached != null && currentTimeMs < cached.expiresAtMs) {
        return cached.value;
    }

    let clientRoute = null;
    let currentIndex = -1;
    try {
        clientRoute = arrival.route();
        if(clientRoute != null) {
            currentIndex = Number(clientRoute.getPlatformIndex(arrival.platformId()));
        }
    } catch(e) {
    }
    if(clientRoute == null || !isFinite(currentIndex) || currentIndex <= 0) {
        jrhPreviousStationHttpRouteLocationCache[cacheKey] = {
            value: null,
            expiresAtMs: currentTimeMs + 5000
        };
        return null;
    }

    let routes = jrhPreviousStationHttpGetRoutes(currentTimeMs);
    if(routes == null) {
        return null;
    }

    let currentStationHex = jrhPreviousStationHttpCurrentStationHex(arrival);
    let currentPlatformName = jrhPreviousStationHttpText(arrival.platformName());
    let exactCandidates = [];
    let looseCandidates = [];
    for(let i = 0; i < routes.length; i++) {
        let route = routes[i];
        if(route == null || route.stations == null || route.stations.length <= currentIndex) {
            continue;
        }
        if(jrhPreviousStationHttpRouteExactMatch(route, arrival)) {
            exactCandidates.push(route);
        } else if(jrhPreviousStationHttpRouteLooseMatch(route, arrival)) {
            looseCandidates.push(route);
        }
    }
    let candidates = exactCandidates.length > 0 ? exactCandidates : looseCandidates;

    let selectedRoute = null;
    let selectedIndex = currentIndex;

    // まずCore routeの同じindexが現在station/platformと一致する候補を選ぶ。
    for(let i = 0; i < candidates.length; i++) {
        let route = candidates[i];
        let station = route.stations[currentIndex];
        if(station == null) {
            continue;
        }
        let stationIdMatches = currentStationHex != null && jrhPreviousStationHttpText(station.id) == currentStationHex;
        let platformNameMatches = currentPlatformName != "" && jrhPreviousStationHttpText(station.name) == currentPlatformName;
        if(stationIdMatches || platformNameMatches) {
            selectedRoute = route;
            break;
        }
    }

    // index対応で決まらない場合はstation hexから現在位置を探索する。
    if(selectedRoute == null && currentStationHex != null) {
        searchByStation:
        for(let i = 0; i < candidates.length; i++) {
            let route = candidates[i];
            for(let j = 1; j < route.stations.length; j++) {
                let station = route.stations[j];
                if(station != null && jrhPreviousStationHttpText(station.id) == currentStationHex) {
                    selectedRoute = route;
                    selectedIndex = j;
                    break searchByStation;
                }
            }
        }
    }

    // route属性で一意なら、SimplifiedRouteとCore routeの停車順が同じことを利用する。
    if(selectedRoute == null && candidates.length == 1) {
        selectedRoute = candidates[0];
        selectedIndex = currentIndex;
    }

    let result = null;
    if(selectedRoute != null && selectedIndex > 0 && selectedIndex < selectedRoute.stations.length) {
        let previousStation = selectedRoute.stations[selectedIndex - 1];
        let currentStation = selectedRoute.stations[selectedIndex];
        if(previousStation != null && previousStation.id != null) {
            result = {
                routeHex: selectedRoute.id == null ? null : String(selectedRoute.id),
                previousStationHex: String(previousStation.id),
                previousPlatformName: jrhPreviousStationHttpText(previousStation.name),
                currentStationHex: currentStation == null || currentStation.id == null ? null : String(currentStation.id),
                currentIndex: selectedIndex
            };
        }
    }

    jrhPreviousStationHttpRouteLocationCache[cacheKey] = {
        value: result,
        expiresAtMs: currentTimeMs + (result == null ? 5000 : jrhPreviousStationHttpRouteCacheTtlMs)
    };
    return result;
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

function jrhPreviousStationHttpFindSameService(snapshot, arrival, expectedPlatformName) {
    if(snapshot == null || snapshot.arrivals == null) {
        return null;
    }

    let departureIndex = Number(arrival.departureIndex());
    let routeName = jrhPreviousStationHttpText(arrival.routeName());
    let routeNumber = jrhPreviousStationHttpText(arrival.routeNumber());
    let routeColor = Number(arrival.routeColor());
    let carCount = Number(arrival.carCount());

    for(let i = 0; i < snapshot.arrivals.length; i++) {
        let candidate = snapshot.arrivals[i];
        if(candidate == null || candidate.realtime !== true) {
            continue;
        }
        if(Number(candidate.departureIndex) != departureIndex) {
            continue;
        }
        if(jrhPreviousStationHttpText(candidate.routeName) != routeName ||
            Number(candidate.routeColor) != routeColor) {
            continue;
        }
        let candidateRouteNumber = jrhPreviousStationHttpText(candidate.routeNumber);
        if(routeNumber != "" && candidateRouteNumber != "" && candidateRouteNumber != routeNumber) {
            continue;
        }
        if(expectedPlatformName != null && expectedPlatformName != "" &&
            jrhPreviousStationHttpText(candidate.platformName) != expectedPlatformName) {
            continue;
        }
        if(carCount > 0 && candidate.cars != null && candidate.cars.length > 0 && candidate.cars.length != carCount) {
            continue;
        }
        return candidate;
    }
    return null;
}

/** Core側時刻をクライアントのepoch時刻へ写像する。 */
function jrhPreviousStationHttpToLocalTime(serverTimeMs, snapshot) {
    let value = Number(serverTimeMs);
    if(!isFinite(value) || snapshot == null || !isFinite(snapshot.currentTime)) {
        return null;
    }
    return snapshot.fetchedAtMs + (value - snapshot.currentTime);
}

/**
 * 既存rendererから呼ばれる前駅判定をCore HTTP API方式へ差し替える。
 * 同一便を前駅でrealtime確認できた場合だけ追跡し、HTTPで発車後の消失を確認して表示を確定する。
 */
updatePreviousStationDepartureCache = function(arrivals, state, currentTimeMs) {
    let store = getPreviousStationDepartureStore(state);
    let seen = {};

    for(let i = 0; i < arrivals.length; i++) {
        let arrival = arrivals[i];
        if(arrival == null || arrival.terminating()) {
            continue;
        }

        let key = getPreviousStationServiceKey(arrival);
        if(seen[key]) {
            continue;
        }
        seen[key] = true;

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
        } else if(record.source == null || String(record.source).indexOf("core-http") != 0) {
            // 旧推定実装の状態が残っていても、HTTP確認なしで表示しない。
            record.departureTimeMs = null;
            record.trackedDepartureTimeMs = null;
            record.departureLocked = false;
            record.displayStartedAtMs = null;
            record.displayCompleted = false;
            record.source = null;
            record.lastHttpSeenAtMs = null;
        }
        record.lastSeenAtMs = currentTimeMs;

        if(record.departureLocked) {
            continue;
        }

        let routeLocation = jrhPreviousStationHttpResolveRouteLocation(arrival, currentTimeMs);
        if(routeLocation == null || routeLocation.previousStationHex == null) {
            record.source = "core-http-route-unresolved";
            jrhPreviousStationDebug(state, key,
                "core-http: route location unresolved: route=" + arrival.routeId() +
                " platform=" + arrival.platformId() +
                " platformName=" + arrival.platformName());
            continue;
        }

        let snapshot = jrhPreviousStationHttpGetStationArrivals(routeLocation.previousStationHex, currentTimeMs);
        if(snapshot == null) {
            record.source = "core-http-unavailable";
            jrhPreviousStationDebug(state, key,
                "core-http: arrivals unavailable: previousStation=" + routeLocation.previousStationHex);
            continue;
        }

        let match = jrhPreviousStationHttpFindSameService(
            snapshot, arrival, routeLocation.previousPlatformName);
        if(match != null) {
            let departureTimeMs = jrhPreviousStationHttpToLocalTime(match.departure, snapshot);
            if(departureTimeMs != null) {
                // 追跡中の予測時刻は表示判定へ渡さない。Coreで発車後の消失を確認して初めて確定する。
                record.departureTimeMs = null;
                record.trackedDepartureTimeMs = departureTimeMs;
                record.lastHttpSeenAtMs = snapshot.fetchedAtMs;
                record.source = "core-http-tracking";
                jrhPreviousStationDebug(state, key,
                    "core-http tracking: departureIndex=" + arrival.departureIndex() +
                    " previousStation=" + routeLocation.previousStationHex +
                    " previousPlatform=" + routeLocation.previousPlatformName +
                    " departureTime=" + departureTimeMs);
            }
            continue;
        }

        record.source = record.lastHttpSeenAtMs == null
            ? "core-http-waiting-first-observation"
            : "core-http-waiting-departure-confirmation";

        // 直前までHTTPで同一便をrealtime追跡できており、予測発車時刻を過ぎた後の
        // 新しいHTTPスナップショットから列車が消えた場合だけ「前駅発車済み」を確定する。
        if(record.trackedDepartureTimeMs != null &&
            record.lastHttpSeenAtMs != null &&
            snapshot.fetchedAtMs > record.lastHttpSeenAtMs &&
            snapshot.fetchedAtMs >= record.trackedDepartureTimeMs) {
            record.departureTimeMs = record.trackedDepartureTimeMs;
            record.departureLocked = true;
            record.source = "core-http-departed";
            jrhPreviousStationDebug(state, key,
                "core-http departed: departureIndex=" + arrival.departureIndex() +
                " previousStation=" + routeLocation.previousStationHex +
                " previousPlatform=" + routeLocation.previousPlatformName);
        } else if(record.lastHttpSeenAtMs == null) {
            jrhPreviousStationDebug(state, key,
                "core-http: waiting for realtime service at previous station: departureIndex=" +
                arrival.departureIndex() + " previousStation=" + routeLocation.previousStationHex +
                " previousPlatform=" + routeLocation.previousPlatformName +
                " candidates=" + snapshot.arrivals.length);
        }
    }

    for(let key in store) {
        let record = store[key];
        if(record == null || currentTimeMs - record.lastSeenAtMs > jrhPreviousStationStateKeepMs) {
            delete store[key];
            if(state.jrhPreviousStationDebug != null) {
                delete state.jrhPreviousStationDebug[key];
            }
        }
    }
};