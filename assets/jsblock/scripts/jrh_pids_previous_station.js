/* JCM正式版の公開済みクラスだけで前駅Arrivalを取得する互換層。 */

const jrhArrivalsCacheClient = Packages.org.mtr.mod.data.ArrivalsCacheClient;
const jrhLongImmutableList = Packages.org.mtr.libraries.it.unimi.dsi.fastutil.longs.LongImmutableList;

/** JCM v2.2.xのArrivalsCacheClientから前駅の同じ便を探す。 */
function findPreviousStationArrival(arrival, previousPlatformId) {
    let rawArrivals = jrhArrivalsCacheClient.INSTANCE.requestArrivals(
        jrhLongImmutableList.of(previousPlatformId));
    let millisOffset = Number(jrhArrivalsCacheClient.INSTANCE.getMillisOffset());
    let currentArrivalTime = Number(arrival.arrivalTime());
    let currentCarCount = Number(arrival.carCount());
    let bestDepartureTime = null;

    // departureIndexは同一siding内の便識別子なので、routeIdと組み合わせて候補を絞る。
    // 複数sidingで同じindexが重なる場合に備え、当駅到着直前の候補を採用する。
    for(let i = 0; i < rawArrivals.size(); i++) {
        let candidate = rawArrivals.get(i);
        if(candidate == null ||
            String(candidate.getDepartureIndex()) != String(arrival.departureIndex()) ||
            String(candidate.getRouteId()) != String(arrival.routeId())) {
            continue;
        }

        let candidateCarCount = Number(candidate.getCarCount());
        if(currentCarCount > 0 && candidateCarCount > 0 &&
            currentCarCount != candidateCarCount) {
            continue;
        }

        let departureTime = Number(candidate.getDeparture()) - millisOffset;
        if(!isFinite(departureTime) || departureTime >= currentArrivalTime) {
            continue;
        }

        if(bestDepartureTime == null || departureTime > bestDepartureTime) {
            bestDepartureTime = departureTime;
        }
    }

    if(bestDepartureTime == null) {
        return null;
    }

    // renderer側はdepartureTime()だけを使うため、必要最小限の互換オブジェクトを返す。
    return {
        departureTime: function() {
            return bestDepartureTime;
        }
    };
}
