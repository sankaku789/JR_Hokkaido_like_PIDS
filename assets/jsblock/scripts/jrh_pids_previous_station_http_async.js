/* JR北海道風ホーム発車標 前駅発車判定 - 非同期HTTPブリッジ。
 *
 * Networking.fetch() をPIDS render用script worker上では実行しない。
 * HTTPはJCMのBackgroundWorkerへ投げ、render側はConcurrentHashMapに保存された
 * 直近スナップショットだけを読む。これによりHTTP待ちが点滅・描画更新を止めない。
 */

const jrhPreviousStationAsyncResults = new Packages.java.util.concurrent.ConcurrentHashMap();
const jrhPreviousStationAsyncInFlight = new Packages.java.util.concurrent.ConcurrentHashMap();
const jrhPreviousStationAsyncNextRequestAt = {};

function jrhPreviousStationAsyncSnapshot(arrival) {
    let route = null;
    let currentIndex = -1;
    let currentStationName = "";
    try {
        route = arrival.route();
        if(route != null) {
            currentIndex = Number(route.getPlatformIndex(arrival.platformId()));
            if(isFinite(currentIndex) && currentIndex >= 0) {
                let routePlatforms = route.getPlatforms();
                if(routePlatforms != null && currentIndex < routePlatforms.size()) {
                    let routePlatform = routePlatforms.get(currentIndex);
                    if(routePlatform != null) {
                        currentStationName = jrhPreviousStationHttpText(routePlatform.getStationName());
                    }
                }
            }
        }
    } catch(e) {
        return null;
    }

    if(route == null || !isFinite(currentIndex) || currentIndex <= 0) {
        return null;
    }

    return {
        currentIndex: Math.floor(currentIndex),
        currentStationName: currentStationName,
        routeName: jrhPreviousStationHttpText(arrival.routeName()),
        routeNumber: jrhPreviousStationHttpText(arrival.routeNumber()),
        routeColor: Number(arrival.routeColor()),
        departureIndex: String(arrival.departureIndex()),
        carCount: Number(arrival.carCount())
    };
}

function jrhPreviousStationAsyncQueryKey(snapshot) {
    return snapshot.routeName + ":" + snapshot.routeNumber + ":" +
        snapshot.routeColor + ":" + snapshot.departureIndex + ":" +
        snapshot.currentIndex + ":" + snapshot.currentStationName;
}

function jrhPreviousStationAsyncRouteExactMatch(route, snapshot) {
    return route != null &&
        jrhPreviousStationHttpText(route.name) == snapshot.routeName &&
        Number(route.color) == snapshot.routeColor &&
        jrhPreviousStationHttpText(route.number) == snapshot.routeNumber;
}

function jrhPreviousStationAsyncRouteLooseMatch(route, snapshot) {
    return route != null &&
        jrhPreviousStationHttpText(route.name) == snapshot.routeName &&
        Number(route.color) == snapshot.routeColor;
}

function jrhPreviousStationAsyncResolvePreviousStation(snapshot, currentTimeMs) {
    let routes = jrhPreviousStationHttpGetRoutes(currentTimeMs);
    if(routes == null) {
        return null;
    }

    let exact = [];
    let loose = [];
    for(let i = 0; i < routes.length; i++) {
        let route = routes[i];
        if(route == null || route.stations == null || route.stations.length <= snapshot.currentIndex) {
            continue;
        }
        if(jrhPreviousStationAsyncRouteExactMatch(route, snapshot)) {
            exact.push(route);
        } else if(jrhPreviousStationAsyncRouteLooseMatch(route, snapshot)) {
            loose.push(route);
        }
    }

    let candidates = exact.length > 0 ? exact : loose;
    let selected = null;

    // SimplifiedRouteとSystem Map routeは同じ停車順。現在駅名も一致する候補を優先する。
    for(let i = 0; i < candidates.length; i++) {
        let station = candidates[i].stations[snapshot.currentIndex];
        if(station != null && snapshot.currentStationName != "" &&
            jrhPreviousStationHttpText(station.name) == snapshot.currentStationName) {
            selected = candidates[i];
            break;
        }
    }

    if(selected == null && candidates.length == 1) {
        selected = candidates[0];
    }
    if(selected == null || snapshot.currentIndex <= 0) {
        return null;
    }

    let previousStation = selected.stations[snapshot.currentIndex - 1];
    if(previousStation == null || previousStation.id == null) {
        return null;
    }
    return String(previousStation.id);
}

function jrhPreviousStationAsyncFindSameService(httpSnapshot, snapshot) {
    if(httpSnapshot == null || httpSnapshot.arrivals == null) {
        return null;
    }

    for(let i = 0; i < httpSnapshot.arrivals.length; i++) {
        let candidate = httpSnapshot.arrivals[i];
        if(candidate == null || candidate.realtime !== true) {
            continue;
        }

        // departureIndexは通常小さい値だが、JSON Number化によるlong精度問題を避けるため
        // 文字列表現も併用する。数値化後が一致する場合も許容する。
        let departureIndexMatches = jrhPreviousStationHttpText(candidate.departureIndex) == snapshot.departureIndex;
        if(!departureIndexMatches) {
            let candidateIndexNumber = Number(candidate.departureIndex);
            let snapshotIndexNumber = Number(snapshot.departureIndex);
            departureIndexMatches = isFinite(candidateIndexNumber) && isFinite(snapshotIndexNumber) &&
                candidateIndexNumber == snapshotIndexNumber;
        }
        if(!departureIndexMatches) {
            continue;
        }

        if(jrhPreviousStationHttpText(candidate.routeName) != snapshot.routeName ||
            Number(candidate.routeColor) != snapshot.routeColor) {
            continue;
        }

        let candidateRouteNumber = jrhPreviousStationHttpText(candidate.routeNumber);
        if(snapshot.routeNumber != "" && candidateRouteNumber != "" &&
            candidateRouteNumber != snapshot.routeNumber) {
            continue;
        }

        if(snapshot.carCount > 0 && candidate.cars != null && candidate.cars.length > 0 &&
            candidate.cars.length != snapshot.carCount) {
            continue;
        }

        return candidate;
    }
    return null;
}

function jrhPreviousStationAsyncFetch(queryKey, snapshotJson) {
    BackgroundWorker.submit(function() {
        try {
            let snapshot = JSON.parse(String(snapshotJson));
            let now = new Date().getTime();
            let previousStationHex = jrhPreviousStationAsyncResolvePreviousStation(snapshot, now);
            if(previousStationHex == null) {
                jrhPreviousStationAsyncResults.put(queryKey, JSON.stringify({
                    status: "unresolved",
                    fetchedAtMs: now
                }));
                return;
            }

            let stationSnapshot = jrhPreviousStationHttpGetStationArrivals(previousStationHex, now);
            if(stationSnapshot == null) {
                jrhPreviousStationAsyncResults.put(queryKey, JSON.stringify({
                    status: "unavailable",
                    fetchedAtMs: new Date().getTime()
                }));
                return;
            }

            let match = jrhPreviousStationAsyncFindSameService(stationSnapshot, snapshot);
            if(match != null) {
                let departureTimeMs = jrhPreviousStationHttpToLocalTime(match.departure, stationSnapshot);
                if(departureTimeMs != null) {
                    jrhPreviousStationAsyncResults.put(queryKey, JSON.stringify({
                        status: "tracking",
                        previousStationHex: previousStationHex,
                        departureTimeMs: departureTimeMs,
                        fetchedAtMs: stationSnapshot.fetchedAtMs
                    }));
                    return;
                }
            }

            jrhPreviousStationAsyncResults.put(queryKey, JSON.stringify({
                status: "missing",
                previousStationHex: previousStationHex,
                fetchedAtMs: stationSnapshot.fetchedAtMs
            }));
        } catch(e) {
            try {
                jrhPreviousStationAsyncResults.put(queryKey, JSON.stringify({
                    status: "error",
                    message: String(e),
                    fetchedAtMs: new Date().getTime()
                }));
            } catch(ignored) {
            }
        } finally {
            jrhPreviousStationAsyncInFlight.remove(queryKey);
        }
    });
}

function jrhPreviousStationAsyncSchedule(snapshot, currentTimeMs) {
    let queryKey = jrhPreviousStationAsyncQueryKey(snapshot);
    let nextAt = jrhPreviousStationAsyncNextRequestAt[queryKey];
    if(nextAt != null && currentTimeMs < nextAt) {
        return queryKey;
    }
    if(jrhPreviousStationAsyncInFlight.putIfAbsent(queryKey, "1") != null) {
        return queryKey;
    }

    jrhPreviousStationAsyncNextRequestAt[queryKey] = currentTimeMs + jrhPreviousStationHttpArrivalRefreshMs;
    try {
        jrhPreviousStationAsyncFetch(queryKey, JSON.stringify(snapshot));
    } catch(e) {
        jrhPreviousStationAsyncInFlight.remove(queryKey);
        jrhPreviousStationAsyncNextRequestAt[queryKey] = currentTimeMs + jrhPreviousStationHttpFailureRetryMs;
    }
    return queryKey;
}

/**
 * render側はHTTPを実行せず、BackgroundWorkerの直近結果だけで状態を更新する。
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
        }
        record.lastSeenAtMs = currentTimeMs;

        if(record.departureLocked) {
            continue;
        }

        let snapshot = jrhPreviousStationAsyncSnapshot(arrival);
        if(snapshot == null) {
            continue;
        }

        let queryKey = jrhPreviousStationAsyncSchedule(snapshot, currentTimeMs);
        let resultJson = jrhPreviousStationAsyncResults.get(queryKey);
        if(resultJson == null) {
            continue;
        }

        let result = null;
        try {
            result = JSON.parse(String(resultJson));
        } catch(e) {
            continue;
        }
        if(result == null) {
            continue;
        }

        if(result.status == "tracking") {
            let departureTimeMs = Number(result.departureTimeMs);
            let fetchedAtMs = Number(result.fetchedAtMs);
            if(isFinite(departureTimeMs) && isFinite(fetchedAtMs)) {
                // 追跡中は表示確定しない。
                record.departureTimeMs = null;
                record.trackedDepartureTimeMs = departureTimeMs;
                record.lastHttpSeenAtMs = fetchedAtMs;
                record.source = "core-http-async-tracking";
            }
            continue;
        }

        if(result.status == "missing") {
            let fetchedAtMs = Number(result.fetchedAtMs);
            if(record.trackedDepartureTimeMs != null &&
                record.lastHttpSeenAtMs != null &&
                isFinite(fetchedAtMs) &&
                fetchedAtMs > record.lastHttpSeenAtMs &&
                fetchedAtMs >= record.trackedDepartureTimeMs) {
                record.departureTimeMs = record.trackedDepartureTimeMs;
                record.departureLocked = true;
                record.source = "core-http-async-departed";
                jrhPreviousStationDebug(state, key,
                    "core-http async departed: route=" + arrival.routeId() +
                    " departureIndex=" + arrival.departureIndex());
            }
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
