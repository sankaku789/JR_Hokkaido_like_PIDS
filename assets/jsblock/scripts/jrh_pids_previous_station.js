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

/**
 * renderer本体では前駅発車が接近表示開始より前の場合だけ表示するため、
 * 短い駅間でも前駅発車表示が出るよう第2行へ互換表示を上書きする。
 */
function jrhRenderPreviousStationOverlay(ctx, state, pids, theme) {
    let firstArrival = pids.arrivals().get(0);
    if(firstArrival == null || pids.isRowHidden(0)) {
        return;
    }

    let currentTimeMs = new Date().getTime();
    if(Number(firstArrival.arrivalTime()) <= currentTimeMs) {
        return;
    }

    let record = getPreviousStationDepartureRecord(firstArrival, state);
    if(record == null ||
        record.departureTimeMs == null ||
        Number(record.departureTimeMs) > currentTimeMs ||
        record.displayCompleted) {
        return;
    }

    if(record.displayStartedAtMs == null) {
        record.displayStartedAtMs = currentTimeMs;
    }

    let warningBlinkIntervalMs = numberOrDefault(
        SCRIPT_INPUT.arrivalWarningBlinkIntervalMs, 500);
    let blinkDurationMs = warningBlinkIntervalMs * jrhPreviousStationBlinkCount * 2;
    let elapsedMs = currentTimeMs - record.displayStartedAtMs;

    if(elapsedMs >= blinkDurationMs) {
        record.displayCompleted = true;
        return;
    }

    let sx = pids.width / 160.0;
    let sy = pids.height / 48.0;
    let unit = Math.min(sx, sy);
    let rowY = (14 + 13 + 4) * sy;

    // 点滅OFF中も下の接近表示等を消し、第2行を空欄にする。
    rectangle(ctx, "Previous station overlay row",
        5 * sx, rowY, 150 * sx, 13 * sy, COLOR_BLACK);

    if(Math.floor(elapsedMs / warningBlinkIntervalMs) % 2 == 0) {
        drawText(ctx, "Previous station departure overlay",
            jrhPreviousStationDepartureText, theme.warning,
            7 * sx, rowY + 2 * sy, 146 * sx, 9, 1.08 * unit, "left", true);
    }
}
