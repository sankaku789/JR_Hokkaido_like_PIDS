/* JR北海道風ホーム発車標 前駅発車判定 - 非同期Core HTTP。
 *
 * Networking.fetch()はPIDS render用script worker上で実行しない。
 * HTTPはJCMのBackgroundWorkerへ投げ、render側はConcurrentHashMapの直近結果だけを読む。
 */

const jrhPreviousStationAsyncResults = new Packages.java.util.concurrent.ConcurrentHashMap();
const jrhPreviousStationAsyncInFlight = new Packages.java.util.concurrent.ConcurrentHashMap();
const jrhPreviousStationDiagLast = new Packages.java.util.concurrent.ConcurrentHashMap();
const jrhPreviousStationAsyncNextRequestAt = {};

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
    if(route == null) {
        return "";
    }
    if(route.routeNumber != null) {
        return jrhText(route.routeNumber);
    }
    if(route.number != null) {
        return jrhText(route.number);
    }
    return "";
}

/** render worker上でArrivalからimmutableな検索条件だけを抜き出す。 */
function jrhPreviousStationAsyncSnapshot(arrival) {
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
            " platformName=" + jrhText(arrival.platformName()) +
            " currentIndex=" + currentIndex);
        return null;
    }

    let snapshot = {
        currentIndex: Math.floor(currentIndex),
        currentPlatformName: jrhText(arrival.platformName()),
        routeName: jrhText(arrival.routeName()),
        routeNumber: jrhText(arrival.routeNumber()),
        routeColor: Number(arrival.routeColor()),
        departureIndex: String(arrival.departureIndex()),
        carCount: Number(arrival.carCount())
    };

    let queryKey = jrhPreviousStationAsyncQueryKey(snapshot);
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
}

function jrhPreviousStationAsyncQueryKey(snapshot) {
    return snapshot.routeName + ":" + snapshot.routeNumber + ":" +
        snapshot.routeColor + ":" + snapshot.departureIndex + ":" +
        snapshot.currentIndex + ":" + snapshot.currentPlatformName;
}

function jrhPreviousStationAsyncRouteExactMatch(route, snapshot) {
    return route != null &&
        jrhText(route.name) == snapshot.routeName &&
        Number(route.color) == snapshot.routeColor &&
        jrhPreviousStationAsyncHttpRouteNumber(route) == snapshot.routeNumber;
}

function jrhPreviousStationAsyncRouteLooseMatch(route, snapshot) {
    return route != null &&
        jrhText(route.name) == snapshot.routeName &&
        Number(route.color) == snapshot.routeColor;
}

/** System Map route上で現在platformと同じindexを探し、1つ前のstation IDを返す。 */
function jrhPreviousStationAsyncResolvePreviousStation(snapshot, currentTimeMs) {
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
        if(station == null) {
            continue;
        }
        if(candidatePlatforms.length < 6) {
            candidatePlatforms.push(
                jrhText(station.name) + "#" + jrhPreviousStationAsyncHttpRouteNumber(candidates[i]));
        }
        // System MapのRouteStation.nameはplatform名。
        if(snapshot.currentPlatformName != "" && jrhText(station.name) == snapshot.currentPlatformName) {
            selected = candidates[i];
            break;
        }
    }

    if(selected == null && candidates.length == 1) {
        selected = candidates[0];
    }
    if(selected == null) {
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
        " current=" + (currentStation == null ? "" : jrhText(currentStation.name)) +
        " previous=" + jrhText(previousStation.name) +
        " previousStationHex=" + previousHex);
    return previousHex;
}

/** 前駅のArrival一覧から同一便を検索する。 */
function jrhPreviousStationAsyncFindSameService(httpSnapshot, snapshot) {
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
                ",depIdx=" + jrhText(candidate.departureIndex) +
                ",route=" + jrhText(candidate.routeName) +
                ",no=" + jrhText(candidate.routeNumber) +
                ",color=" + candidate.routeColor +
                ",platform=" + jrhText(candidate.platformName) +
                ",cars=" + (candidate.cars == null ? 0 : candidate.cars.length) + "}");
        }

        if(candidate.realtime !== true) {
            continue;
        }
        realtimeCount++;

        let departureIndexMatches = jrhText(candidate.departureIndex) == snapshot.departureIndex;
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

        if(jrhText(candidate.routeName) != snapshot.routeName ||
            Number(candidate.routeColor) != snapshot.routeColor) {
            continue;
        }
        routeCount++;

        let candidateRouteNumber = jrhText(candidate.routeNumber);
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
            " platform=" + jrhText(candidate.platformName) +
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
}

function jrhPreviousStationAsyncFetch(queryKey, snapshotJson) {
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
        jrhPreviousStationDiag("schedule:" + queryKey, "schedule: failed key=" + queryKey + " error=" + e);
    }
    return queryKey;
}

function jrhPreviousStationAsyncReadResult(queryKey) {
    let resultJson = jrhPreviousStationAsyncResults.get(queryKey);
    if(resultJson == null) {
        return null;
    }
    try {
        return JSON.parse(String(resultJson));
    } catch(e) {
        jrhPreviousStationDiag("result-json:" + queryKey, "result: invalid JSON key=" + queryKey + " error=" + e);
        return null;
    }
}

function jrhPreviousStationAsyncLogRenderState(queryKey, result, record) {
    jrhPreviousStationDiag(
        "render:" + queryKey,
        "render: key=" + queryKey +
        " httpStatus=" + (result == null || result.status == null ? "none" : String(result.status)) +
        " source=" + (record == null ? "null" : String(record.source)) +
        " trackedDeparture=" + (record == null ? "null" : String(record.trackedDepartureTimeMs)) +
        " departureTime=" + (record == null ? "null" : String(record.departureTimeMs)) +
        " locked=" + (record == null ? "false" : String(record.departureLocked)) +
        " displayStarted=" + (record == null ? "null" : String(record.displayStartedAtMs)) +
        " displayCompleted=" + (record == null ? "false" : String(record.displayCompleted)));
}

/** render側はHTTPを待たず、BackgroundWorkerの直近結果だけで前駅発車stateを更新する。 */
updatePreviousStationDepartureCache = function(arrivals, state, currentTimeMs) {
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

        let record = jrhGetOrCreatePreviousStationDepartureRecord(arrival, state, currentTimeMs);
        let snapshot = jrhPreviousStationAsyncSnapshot(arrival);
        if(snapshot == null) {
            continue;
        }
        let queryKey = jrhPreviousStationAsyncQueryKey(snapshot);

        if(record.departureLocked) {
            jrhPreviousStationAsyncLogRenderState(
                queryKey, jrhPreviousStationAsyncReadResult(queryKey), record);
            continue;
        }

        jrhPreviousStationAsyncSchedule(snapshot, currentTimeMs);
        let result = jrhPreviousStationAsyncReadResult(queryKey);
        if(result == null) {
            jrhPreviousStationAsyncLogRenderState(queryKey, null, record);
            continue;
        }

        if(result.status == "tracking") {
            let departureTimeMs = Number(result.departureTimeMs);
            let fetchedAtMs = Number(result.fetchedAtMs);
            if(isFinite(departureTimeMs) && isFinite(fetchedAtMs)) {
                // 追跡中の予測時刻は表示判定へ渡さない。
                record.departureTimeMs = null;
                record.trackedDepartureTimeMs = departureTimeMs;
                record.lastHttpSeenAtMs = fetchedAtMs;
                record.source = "core-http-async-tracking";
            }
            jrhPreviousStationAsyncLogRenderState(queryKey, result, record);
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

        jrhPreviousStationAsyncLogRenderState(queryKey, result, record);
    }

    jrhCleanupPreviousStationDepartureStore(state, currentTimeMs);
};
