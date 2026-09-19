/* JCM正式版の公開済みクラスだけで前駅Arrivalを取得する互換層。 */

const jrhArrivalsCacheClient = Packages.org.mtr.mod.data.ArrivalsCacheClient;
const jrhLongImmutableList = Packages.org.mtr.libraries.it.unimi.dsi.fastutil.longs.LongImmutableList;
const jrhArrivalWrapperClass = Packages.com.lx862.jcm.mod.scripting.pids.ArrivalWrapper;

/** JCM v2.2.xのArrivalsCacheClientから前駅の同じ便を探す。 */
function findPreviousStationArrival(arrival, previousPlatformId) {
    let rawArrivals = jrhArrivalsCacheClient.INSTANCE.requestArrivals(
        jrhLongImmutableList.of(previousPlatformId));

    for(let i = 0; i < rawArrivals.size(); i++) {
        let candidate = new jrhArrivalWrapperClass(rawArrivals.get(i));
        if(isSamePreviousStationService(arrival, candidate)) {
            return candidate;
        }
    }
    return null;
}
