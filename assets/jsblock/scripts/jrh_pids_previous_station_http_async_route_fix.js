/* MTR Core System Map route照合互換修正。
 *
 * RouteStation.name は駅名ではなく platform 名なので、
 * JCM側も arrival.platformName() と比較する。
 * route番号はCore世代差を考慮し routeNumber / number の両方を受理する。
 */

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
        return null;
    }

    if(route == null || !isFinite(currentIndex) || currentIndex <= 0) {
        return null;
    }

    return {
        currentIndex: Math.floor(currentIndex),
        currentPlatformName: jrhPreviousStationHttpText(arrival.platformName()),
        routeName: jrhPreviousStationHttpText(arrival.routeName()),
        routeNumber: jrhPreviousStationHttpText(arrival.routeNumber()),
        routeColor: Number(arrival.routeColor()),
        departureIndex: String(arrival.departureIndex()),
        carCount: Number(arrival.carCount())
    };
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

    // System MapのRouteStation.nameはplatform名。
    for(let i = 0; i < candidates.length; i++) {
        let station = candidates[i].stations[snapshot.currentIndex];
        if(station != null && snapshot.currentPlatformName != "" &&
            jrhPreviousStationHttpText(station.name) == snapshot.currentPlatformName) {
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
};
