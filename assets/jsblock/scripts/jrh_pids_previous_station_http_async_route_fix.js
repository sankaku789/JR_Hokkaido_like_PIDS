/* MTR Core System Map route照合互換修正 + 診断ログ。
 *
 * RouteStation.name は駅名ではなく platform 名なので、
 * JCM側も arrival.platformName() と比較する。
 * route番号はCore世代差を考慮し routeNumber / number の両方を受理する。
 *
 * 診断ログは同じ状態を連打しない。latest.log の
 * [JRHPIDS previous-station diag] を追えば、前駅解決→Arrival取得→便照合→表示確定まで確認できる。
 */

const jrhPreviousStationDiagLast = new Packages.java.util.concurrent.ConcurrentHashMap();

function jrhPreviousStationDiag(key, message) {
    try {
        let text = String(message);
        let previous = jrhPreviousStationDiagLast.put(String(key), text);
        if(previous == null || String(previous) != text) {
            console.warn("[JRHPIDS previous-station diag] " + text);
        }
    } catch(e) {
    }
}

function jrhPreviousStationAsyncHttpRouteNumber(route) {
    if(route == null) return "";
    if(route.routeNumber != null) return jrhPreviousStationHttpText(route.routeNumber);
    if(route.number != null) return jrhPreviousStationHttpText(route.number);
    return "";
}

jrhPreviousStationAsyncSnapshot = function(arrival) {
    let route = null;
    let currentIndex = -1;
    try {
        route = arrival.route();
        if(route != null) {
            currentIndex = Number(route.getPlatformIndex(arrival.platformId()));
        }
    } catch(e) {
        jrhPreviousStationDiag("snapshot-exception", "snapshot: exception=" + e);
        return null;
    }

    if(route == null || !isFinite(currentIndex) || currentIndex <= 0) {
        jrhPreviousStationDiag(
            "snapshot-invalid:" + String(arrival.departureIndex()),
            "snapshot: unavailable route=" + String(arrival.routeId()) +
            " platform=" + String(arrival.platformId()) +
            " platformName=" + jrhPreviousStationHttpText(arrival.platformName()) +
            " currentIndex=" + currentIndex);
        return null;
    }

    let snapshot = {
        currentIndex: Math.floor(currentIndex),
        currentPlatformName: jrhPreviousStationHttpText(arrival.platformName()),
        routeName: jrhPreviousStationHttpText(arrival.routeName()),
        routeNumber: jrhPreviousStationHttpText(arrival.routeNumber()),
        routeColor: Number(arrival.routeColor()),
        departureIndex: String(arrival.departureIndex()),
        carCount: Number(arrival.carCount())
    };

    let queryKey = snapshot.routeName + ":" + snapshot.routeNumber + ":" +
        snapshot.routeColor + ":" + snapshot.departureIndex + ":" +
        snapshot.currentIndex + ":" + snapshot.currentPlatformName;
    jrhPreviousStationDiag(
        "snapshot:" + queryKey,
        "snapshot: route=" + snapshot.routeName +
        " number=" + snapshot.routeNumber +
        " color=" + snapshot.routeColor +
        " platform=" + snapshot.currentPlatformName +
        " index=" + snapshot.currentIndex +
        " departureIndex=" + snapshot.departureIndex +
        " cars=" + snapshot.carCount);
    return snapshot;
};

jrhPreviousStationAsyncQueryKey = function(snapshot) {
    return snapshot.routeName + ":" + snapshot.routeNumber + ":" +
        snapshot.routeColor + ":" + snapshot.departureIndex + ":" +
        snapshot.currentIndex + ":" + snapshot.currentPlatformName;
};

jrhPreviousStationAsyncRouteExactMatch = function(route, snapshot) {
    return route != null &&
        jrhPreviousStationHttpText(route.name) == snapshot.routeName &&
        Number(route.color) == snapshot.routeColor &&
        jrhPreviousStationAsyncHttpRouteNumber(route) == snapshot.routeNumber;
};

jrhPreviousStationAsyncRouteLooseMatch = function(route, snapshot) {
    return route != null &&
        jrhPreviousStationHttpText(route.name) == snapshot.routeName &&
        Number(route.color) == snapshot.routeColor;
};

jrhPreviousStationAsyncResolvePreviousStation = function(snapshot, currentTimeMs) {
    let queryKey = jrhPreviousStationAsyncQueryKey(snapshot);
    let routes = jrhPreviousStationHttpGetRoutes(currentTimeMs);
    if(routes == null) {
        jrhPreviousStationDiag("resolve:" + queryKey, "resolve: routes unavailable key=" + queryKey);
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
    let candidatePlatforms = [];

    for(let i = 0; i < candidates.length; i++) {
        let station = candidates[i].stations[snapshot.currentIndex];
        if(station != null) {
            if(candidatePlatforms.length < 6) {
                candidatePlatforms.push(
                    jrhPreviousStationHttpText(station.name) +
                    "#" + jrhPreviousStationAsyncHttpRouteNumber(candidates[i]));
            }
            if(snapshot.currentPlatformName != "" &&
                jrhPreviousStationHttpText(station.name) == snapshot.currentPlatformName) {
                selected = candidates[i];
                break;
            }
        }
    }

    if(selected == null && candidates.length == 1) {
        selected = candidates[0];
    }
    if(selected == null || snapshot.currentIndex <= 0) {
        jrhPreviousStationDiag(
            "resolve:" + queryKey,
            "resolve: FAILED key=" + queryKey +
            " routes=" + routes.length +
            " exact=" + exact.length +
            " loose=" + loose.length +
            " candidates=" + candidates.length +
            " currentPlatform=" + snapshot.currentPlatformName +
            " candidatePlatforms=[" + candidatePlatforms.join(",") + "]");
        return null;
    }

    let previousStation = selected.stations[snapshot.currentIndex - 1];
    let currentStation = selected.stations[snapshot.currentIndex];
    if(previousStation == null || previousStation.id == null) {
        jrhPreviousStationDiag(
            "resolve:" + queryKey,
            "resolve: selected route but previous station is missing key=" + queryKey);
        return null;
    }

    let previousHex = String(previousStation.id);
    jrhPreviousStationDiag(
        "resolve:" + queryKey,
        "resolve: OK key=" + queryKey +
        " exact=" + exact.length +
        " loose=" + loose.length +
        " current=" + (currentStation == null ? "" : jrhPreviousStationHttpText(currentStation.name)) +
        " previous=" + jrhPreviousStationHttpText(previousStation.name) +
        " previousStationHex=" + previousHex);
    return previousHex;
};

jrhPreviousStationAsyncFindSameService = function(httpSnapshot, snapshot) {
    let queryKey = jrhPreviousStationAsyncQueryKey(snapshot);
    if(httpSnapshot == null || httpSnapshot.arrivals == null) {
        jrhPreviousStationDiag("match:" + queryKey, "match: arrivals unavailable key=" + queryKey);
        return null;
    }

    let total = httpSnapshot.arrivals.length;
    let realtimeCount = 0;
    let departureIndexCount = 0;
    let routeCount = 0;
    let routeNumberCount = 0;
    let carCount = 0;
    let samples = [];

    for(let i = 0; i < httpSnapshot.arrivals.length; i++) {
        let candidate = httpSnapshot.arrivals[i];
        if(candidate == null) {
            continue;
        }

        if(samples.length < 5) {
            samples.push(
                "{rt=" + candidate.realtime +
                ",depIdx=" + jrhPreviousStationHttpText(candidate.departureIndex) +
                ",route=" + jrhPreviousStationHttpText(candidate.routeName) +
                ",no=" + jrhPreviousStationHttpText(candidate.routeNumber) +
                ",color=" + candidate.routeColor +
                ",platform=" + jrhPreviousStationHttpText(candidate.platformName) +
                ",cars=" + (candidate.cars == null ? 0 : candidate.cars.length) + "}");
        }

        if(candidate.realtime !== true) {
            continue;
        }
        realtimeCount++;

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
        departureIndexCount++;

        if(jrhPreviousStationHttpText(candidate.routeName) != snapshot.routeName ||
            Number(candidate.routeColor) != snapshot.routeColor) {
            continue;
        }
        routeCount++;

        let candidateRouteNumber = jrhPreviousStationHttpText(candidate.routeNumber);
        if(snapshot.routeNumber != "" && candidateRouteNumber != "" &&
            candidateRouteNumber != snapshot.routeNumber) {
            continue;
        }
        routeNumberCount++;

        if(snapshot.carCount > 0 && candidate.cars != null && candidate.cars.length > 0 &&
            candidate.cars.length != snapshot.carCount) {
            continue;
        }
        carCount++;

        jrhPreviousStationDiag(
            "match:" + queryKey,
            "match: OK key=" + queryKey +
            " total=" + total +
            " departure=" + candidate.departure +
            " platform=" + jrhPreviousStationHttpText(candidate.platformName) +
            " realtime=" + candidate.realtime);
        return candidate;
    }

    jrhPreviousStationDiag(
        "match:" + queryKey,
        "match: FAILED key=" + queryKey +
        " total=" + total +
        " realtime=" + realtimeCount +
        " depIndex=" + departureIndexCount +
        " route=" + routeCount +
        " routeNumber=" + routeNumberCount +
        " cars=" + carCount +
        " samples=[" + samples.join(",") + "]");
    return null;
};

jrhPreviousStationAsyncFetch = function(queryKey, snapshotJson) {
    BackgroundWorker.submit(function() {
        try {
            let snapshot = JSON.parse(String(snapshotJson));
            let now = new Date().getTime();
            jrhPreviousStationDiag("fetch-start:" + queryKey, "fetch: start key=" + queryKey);

            let previousStationHex = jrhPreviousStationAsyncResolvePreviousStation(snapshot, now);
            if(previousStationHex == null) {
                jrhPreviousStationAsyncResults.put(queryKey, JSON.stringify({
                    status: "unresolved",
                    fetchedAtMs: now
                }));
                jrhPreviousStationDiag("fetch-result:" + queryKey, "fetch: status=unresolved key=" + queryKey);
                return;
            }

            let stationSnapshot = jrhPreviousStationHttpGetStationArrivals(previousStationHex, now);
            if(stationSnapshot == null) {
                jrhPreviousStationAsyncResults.put(queryKey, JSON.stringify({
                    status: "unavailable",
                    fetchedAtMs: new Date().getTime()
                }));
                jrhPreviousStationDiag(
                    "fetch-result:" + queryKey,
                    "fetch: status=unavailable key=" + queryKey +
                    " previousStationHex=" + previousStationHex);
                return;
            }

            jrhPreviousStationDiag(
                "station-arrivals:" + queryKey,
                "arrivals: key=" + queryKey +
                " previousStationHex=" + previousStationHex +
                " count=" + (stationSnapshot.arrivals == null ? 0 : stationSnapshot.arrivals.length) +
                " coreCurrentTime=" + stationSnapshot.currentTime +
                " fetchedAtMs=" + stationSnapshot.fetchedAtMs);

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
                    jrhPreviousStationDiag(
                        "fetch-result:" + queryKey,
                        "fetch: status=tracking key=" + queryKey +
                        " previousStationHex=" + previousStationHex +
                        " departureCore=" + match.departure +
                        " departureLocal=" + departureTimeMs);
                    return;
                }
                jrhPreviousStationDiag(
                    "time-map:" + queryKey,
                    "fetch: matched service but departure time mapping failed key=" + queryKey +
                    " departure=" + match.departure +
                    " currentTime=" + stationSnapshot.currentTime);
            }

            jrhPreviousStationAsyncResults.put(queryKey, JSON.stringify({
                status: "missing",
                previousStationHex: previousStationHex,
                fetchedAtMs: stationSnapshot.fetchedAtMs
            }));
            jrhPreviousStationDiag(
                "fetch-result:" + queryKey,
                "fetch: status=missing key=" + queryKey +
                " previousStationHex=" + previousStationHex +
                " arrivals=" + (stationSnapshot.arrivals == null ? 0 : stationSnapshot.arrivals.length));
        } catch(e) {
            try {
                jrhPreviousStationAsyncResults.put(queryKey, JSON.stringify({
                    status: "error",
                    message: String(e),
                    fetchedAtMs: new Date().getTime()
                }));
                jrhPreviousStationDiag(
                    "fetch-result:" + queryKey,
                    "fetch: status=error key=" + queryKey + " error=" + e);
            } catch(ignored) {
            }
        } finally {
            jrhPreviousStationAsyncInFlight.remove(queryKey);
        }
    });
};

const jrhPreviousStationAsyncUpdateWithoutDiag = updatePreviousStationDepartureCache;
updatePreviousStationDepartureCache = function(arrivals, state, currentTimeMs) {
    jrhPreviousStationAsyncUpdateWithoutDiag(arrivals, state, currentTimeMs);

    for(let i = 0; i < arrivals.length; i++) {
        let arrival = arrivals[i];
        if(arrival == null || arrival.terminating()) {
            continue;
        }
        let snapshot = jrhPreviousStationAsyncSnapshot(arrival);
        if(snapshot == null) {
            continue;
        }
        let queryKey = jrhPreviousStationAsyncQueryKey(snapshot);
        let resultJson = jrhPreviousStationAsyncResults.get(queryKey);
        let resultStatus = "none";
        if(resultJson != null) {
            try {
                let result = JSON.parse(String(resultJson));
                if(result != null && result.status != null) {
                    resultStatus = String(result.status);
                }
            } catch(e) {
                resultStatus = "invalid-json";
            }
        }

        let record = getPreviousStationDepartureRecord(arrival, state);
        jrhPreviousStationDiag(
            "render:" + queryKey,
            "render: key=" + queryKey +
            " httpStatus=" + resultStatus +
            " source=" + (record == null ? "null" : String(record.source)) +
            " trackedDeparture=" + (record == null ? "null" : String(record.trackedDepartureTimeMs)) +
            " departureTime=" + (record == null ? "null" : String(record.departureTimeMs)) +
            " locked=" + (record == null ? "false" : String(record.departureLocked)) +
            " displayStarted=" + (record == null ? "null" : String(record.displayStartedAtMs)) +
            " displayCompleted=" + (record == null ? "false" : String(record.displayCompleted)));
    }
};
