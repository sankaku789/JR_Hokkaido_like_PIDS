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
const jrhPreviousStationHttpStationCache = {};
const jrhPreviousStationHttpPreviousStationCache = {};

function jrhPreviousStationHttpDimension() {
    let value = Number(SCRIPT_INPUT.previousStationHttpDimension);
    return isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function jrhPreviousStationHttpLocalPort() {
    try {
        let port = Number(Packages.org.mtr.mod.InitClient.getServerPort());
        return isFinite(port) && port > 0 ? Math.floor(port) : 0;
    } catch(e) {
        return 0;
    }
}

function jrhPreviousStationHttpBaseUrl() {
    let port = jrhPreviousStationHttpLocalPort();
    return port <= 0 ? null : "http://127.0.0.1:" + port;
}

function jrhPreviousStationHttpRequest(path, body, currentTimeMs) {
    if(currentTimeMs < jrhPreviousStationHttpUnavailableUntilMs || typeof Networking == "undefined") {
        return null;
    }

    let baseUrl = jrhPreviousStationHttpBaseUrl();
    if(baseUrl == null) {
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
        if(response == null || !response.ok() || response.getData() == null) {
            jrhPreviousStationHttpUnavailableUntilMs = currentTimeMs + jrhPreviousStationHttpFailureRetryMs;
            return null;
        }

        let text = response.getData().asString();
        if(text == null || String(text).trim() == "") {
            jrhPreviousStationHttpUnavailableUntilMs = currentTimeMs + jrhPreviousStationHttpFailureRetryMs;
            return null;
        }

        let envelope = JSON.parse(String(text));
        if(envelope == null || Number(envelope.status) != 200 || envelope.data == null) {
            jrhPreviousStationHttpUnavailableUntilMs = currentTimeMs + jrhPreviousStationHttpFailureRetryMs;
            return null;
        }

        jrhPreviousStationHttpUnavailableUntilMs = 0;
        return envelope.data;
    } catch(e) {
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

function jrhPreviousStationHttpRouteMatches(httpRoute, arrival) {
    if(httpRoute == null) {
        return false;
    }
    return String(httpRoute.name) == String(arrival.routeName()) &&
        Number(httpRoute.color) == Number(arrival.routeColor()) &&
        String(httpRoute.number) == String(arrival.routeNumber());
}

/** HTTPのroute情報から前駅stationの正確なhex IDを求める。 */
function jrhPreviousStationHttpPreviousStationHex(arrival, currentTimeMs) {
    let currentStationHex = jrhPreviousStationHttpCurrentStationHex(arrival);
    if(currentStationHex == null) {
        return null;
    }

    let cacheKey = String(arrival.routeId()) + ":" + String(arrival.platformId());
    let cached = jrhPreviousStationHttpPreviousStationCache[cacheKey];
    if(cached != null && cached.currentStationHex == currentStationHex) {
        return cached.previousStationHex;
    }

    let routes = jrhPreviousStationHttpGetRoutes(currentTimeMs);
    if(routes == null) {
        return null;
    }

    let currentPlatformName = String(arrival.platformName());
    for(let i = 0; i < routes.length; i++) {
        let route = routes[i];
        if(!jrhPreviousStationHttpRouteMatches(route, arrival) || route.stations == null) {
            continue;
        }

        let fallbackIndex = -1;
        for(let j = 0; j < route.stations.length; j++) {
            let station = route.stations[j];
            if(station == null || String(station.id) != currentStationHex) {
                continue;
            }
            if(fallbackIndex < 0) {
                fallbackIndex = j;
            }
            if(String(station.name) == currentPlatformName) {
                fallbackIndex = j;
                break;
            }
        }

        if(fallbackIndex > 0) {
            let previousStation = route.stations[fallbackIndex - 1];
            if(previousStation != null && previousStation.id != null) {
                let previousStationHex = String(previousStation.id);
                jrhPreviousStationHttpPreviousStationCache[cacheKey] = {
                    currentStationHex: currentStationHex,
                    previousStationHex: previousStationHex
                };
                return previousStationHex;
            }
        }
    }

    return null;
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
        return null;
    }

    jrhPreviousStationHttpStationCache[stationHex] = snapshot;
    return snapshot;
}

function jrhPreviousStationHttpFindSameService(snapshot, arrival) {
    if(snapshot == null || snapshot.arrivals == null) {
        return null;
    }

    let routeId = Number(arrival.routeId());
    let departureIndex = Number(arrival.departureIndex());
    let routeName = String(arrival.routeName());
    let routeNumber = String(arrival.routeNumber());
    let routeColor = Number(arrival.routeColor());
    let carCount = Number(arrival.carCount());

    for(let i = 0; i < snapshot.arrivals.length; i++) {
        let candidate = snapshot.arrivals[i];
        if(candidate == null || candidate.realtime !== true) {
            continue;
        }
        if(Number(candidate.routeId) != routeId || Number(candidate.departureIndex) != departureIndex) {
            continue;
        }
        if(String(candidate.routeName) != routeName ||
            String(candidate.routeNumber) != routeNumber ||
            Number(candidate.routeColor) != routeColor) {
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

        let previousStationHex = jrhPreviousStationHttpPreviousStationHex(arrival, currentTimeMs);
        if(previousStationHex == null) {
            jrhPreviousStationDebug(state, key, "core-http: previous station unavailable");
            continue;
        }

        let snapshot = jrhPreviousStationHttpGetStationArrivals(previousStationHex, currentTimeMs);
        if(snapshot == null) {
            jrhPreviousStationDebug(state, key, "core-http: unavailable");
            continue;
        }

        let match = jrhPreviousStationHttpFindSameService(snapshot, arrival);
        if(match != null) {
            let departureTimeMs = jrhPreviousStationHttpToLocalTime(match.departure, snapshot);
            if(departureTimeMs != null) {
                // 追跡中の予測時刻は表示判定へ渡さない。Coreで発車後の消失を確認して初めて確定する。
                record.departureTimeMs = null;
                record.trackedDepartureTimeMs = departureTimeMs;
                record.lastHttpSeenAtMs = snapshot.fetchedAtMs;
                record.source = "core-http-tracking";
                jrhPreviousStationDebug(state, key,
                    "core-http tracking: route=" + arrival.routeId() +
                    " departureIndex=" + arrival.departureIndex() +
                    " previousStation=" + previousStationHex +
                    " departureTime=" + departureTimeMs);
            }
            continue;
        }

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
                "core-http departed: route=" + arrival.routeId() +
                " departureIndex=" + arrival.departureIndex() +
                " previousStation=" + previousStationHex);
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
