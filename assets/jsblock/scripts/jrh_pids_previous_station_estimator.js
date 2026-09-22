/* JR北海道風ホーム発車標 前駅発車推定。
 *
 * MTRのArrivalsCacheへ追加問い合わせを行わず、JCMが各PIDSへ渡したArrivalだけを観測する。
 * 同一便を前駅PIDSと現在駅PIDSの双方で観測できた場合は、その差から駅間所要時間を学習し、
 * 直接観測できない場合は駅間学習値→路線学習値→設定fallbackの順で推定する。
 */

const jrhPreviousStationSafeObservationKeepMs = 75 * 60 * 1000;
const jrhPreviousStationSafeLearningKeepMs = 6 * 60 * 60 * 1000;
const jrhPreviousStationSafeCleanupIntervalMs = 60 * 1000;
const jrhPreviousStationSafeSampleLimit = 9;
const jrhPreviousStationSafeMinTravelMs = 5 * 1000;
const jrhPreviousStationSafeMaxTravelMs = 60 * 60 * 1000;
const jrhPreviousStationSafeDefaultFallbackSeconds = 60;

// ParsedScriptのscope内だけで共有する。MTR/JCMの共有キャッシュには書き込まない。
const jrhPreviousStationSafeObservedPlatforms = {};
const jrhPreviousStationSafeSegmentModels = {};
let jrhPreviousStationSafeNextCleanupMs = 0;

function jrhPreviousStationSafeNumber(value) {
    let result = Number(value);
    return isFinite(result) ? result : null;
}

function jrhPreviousStationSafeMedian(values) {
    if(values == null || values.length == 0) {
        return null;
    }
    let sorted = values.slice().sort(function(a, b) { return a - b; });
    let middle = Math.floor(sorted.length / 2);
    if(sorted.length % 2 == 1) {
        return sorted[middle];
    }
    return (sorted[middle - 1] + sorted[middle]) / 2;
}

function jrhPreviousStationSafeServiceKey(arrival) {
    return String(arrival.routeId()) + ":" +
        String(arrival.departureIndex()) + ":" +
        String(arrival.carCount());
}

function jrhPreviousStationSafeSegmentKey(routeId, previousPlatformId, currentPlatformId) {
    return "r" + String(routeId) +
        ":p" + String(previousPlatformId) +
        ">p" + String(currentPlatformId);
}

function jrhPreviousStationSafeCleanup(currentTimeMs) {
    if(currentTimeMs < jrhPreviousStationSafeNextCleanupMs) {
        return;
    }
    jrhPreviousStationSafeNextCleanupMs = currentTimeMs + jrhPreviousStationSafeCleanupIntervalMs;

    for(let platformKey in jrhPreviousStationSafeObservedPlatforms) {
        let platformBucket = jrhPreviousStationSafeObservedPlatforms[platformKey];
        let hasObservation = false;
        if(platformBucket != null) {
            for(let routeKey in platformBucket.byRoute) {
                let routeBucket = platformBucket.byRoute[routeKey];
                for(let serviceKey in routeBucket) {
                    let observation = routeBucket[serviceKey];
                    if(observation == null ||
                        currentTimeMs - observation.observedAtMs > jrhPreviousStationSafeObservationKeepMs) {
                        delete routeBucket[serviceKey];
                    } else {
                        hasObservation = true;
                    }
                }
                if(Object.keys(routeBucket).length == 0) {
                    delete platformBucket.byRoute[routeKey];
                }
            }
        }
        if(!hasObservation) {
            delete jrhPreviousStationSafeObservedPlatforms[platformKey];
        }
    }

    for(let segmentKey in jrhPreviousStationSafeSegmentModels) {
        let model = jrhPreviousStationSafeSegmentModels[segmentKey];
        if(model == null) {
            delete jrhPreviousStationSafeSegmentModels[segmentKey];
            continue;
        }
        for(let serviceKey in model.samples) {
            let sample = model.samples[serviceKey];
            if(sample == null ||
                currentTimeMs - sample.observedAtMs > jrhPreviousStationSafeLearningKeepMs) {
                delete model.samples[serviceKey];
            }
        }
        if(Object.keys(model.samples).length == 0) {
            delete jrhPreviousStationSafeSegmentModels[segmentKey];
        }
    }
}

/** このPIDSにJCMから渡されたArrivalをread-onlyな観測値として保存する。 */
function jrhPreviousStationSafeObserve(arrivals, currentTimeMs) {
    let seen = {};
    for(let i = 0; i < arrivals.length; i++) {
        let arrival = arrivals[i];
        if(arrival == null || arrival.terminating()) {
            continue;
        }

        let departureTimeMs = jrhPreviousStationSafeNumber(arrival.departureTime());
        let arrivalTimeMs = jrhPreviousStationSafeNumber(arrival.arrivalTime());
        if(departureTimeMs == null || arrivalTimeMs == null) {
            continue;
        }

        let platformId = String(arrival.platformId());
        let routeId = String(arrival.routeId());
        let serviceKey = jrhPreviousStationSafeServiceKey(arrival);
        let observationKey = platformId + ":" + serviceKey;
        if(seen[observationKey]) {
            continue;
        }
        seen[observationKey] = true;

        let platformBucket = jrhPreviousStationSafeObservedPlatforms[platformId];
        if(platformBucket == null) {
            platformBucket = {byRoute: {}};
            jrhPreviousStationSafeObservedPlatforms[platformId] = platformBucket;
        }
        let routeKey = "r" + routeId;
        let routeBucket = platformBucket.byRoute[routeKey];
        if(routeBucket == null) {
            routeBucket = {};
            platformBucket.byRoute[routeKey] = routeBucket;
        }

        routeBucket[serviceKey] = {
            departureIndex: String(arrival.departureIndex()),
            carCount: Number(arrival.carCount()),
            departureTimeMs: departureTimeMs,
            arrivalTimeMs: arrivalTimeMs,
            realtime: Boolean(arrival.realtime()),
            observedAtMs: currentTimeMs
        };
    }
}

/** 前駅PIDSが観測済みの同一便を探す。exactが無い場合は候補が1本だけのときだけ返す。 */
function jrhPreviousStationSafeFindObservation(arrival, previousPlatformId, currentTimeMs) {
    let platformBucket = jrhPreviousStationSafeObservedPlatforms[String(previousPlatformId)];
    if(platformBucket == null) {
        return null;
    }
    let routeBucket = platformBucket.byRoute["r" + String(arrival.routeId())];
    if(routeBucket == null) {
        return null;
    }

    let currentArrivalTimeMs = jrhPreviousStationSafeNumber(arrival.arrivalTime());
    if(currentArrivalTimeMs == null) {
        return null;
    }
    let currentDepartureIndex = String(arrival.departureIndex());
    let currentCarCount = Number(arrival.carCount());
    let exact = null;
    let onlyCandidate = null;
    let candidateCount = 0;

    for(let serviceKey in routeBucket) {
        let candidate = routeBucket[serviceKey];
        if(candidate == null ||
            currentTimeMs - candidate.observedAtMs > jrhPreviousStationSafeObservationKeepMs) {
            continue;
        }
        if(currentCarCount > 0 && candidate.carCount > 0 && currentCarCount != candidate.carCount) {
            continue;
        }

        let travelMs = currentArrivalTimeMs - candidate.departureTimeMs;
        if(travelMs < jrhPreviousStationSafeMinTravelMs ||
            travelMs > jrhPreviousStationSafeMaxTravelMs) {
            continue;
        }

        let result = {
            departureTimeMs: candidate.departureTimeMs,
            travelMs: travelMs,
            realtime: candidate.realtime,
            exactMatch: candidate.departureIndex == currentDepartureIndex
        };
        if(result.exactMatch) {
            if(exact == null || candidate.observedAtMs > exact.observedAtMs) {
                result.observedAtMs = candidate.observedAtMs;
                exact = result;
            }
        } else {
            candidateCount++;
            onlyCandidate = result;
        }
    }

    if(exact != null) {
        return exact;
    }
    return candidateCount == 1 ? onlyCandidate : null;
}

function jrhPreviousStationSafeLearnSegment(arrival, previousPlatformId, travelMs, currentTimeMs) {
    if(!isFinite(travelMs) ||
        travelMs < jrhPreviousStationSafeMinTravelMs ||
        travelMs > jrhPreviousStationSafeMaxTravelMs) {
        return;
    }

    let segmentKey = jrhPreviousStationSafeSegmentKey(
        arrival.routeId(), previousPlatformId, arrival.platformId());
    let model = jrhPreviousStationSafeSegmentModels[segmentKey];
    if(model == null) {
        model = {
            routeId: String(arrival.routeId()),
            samples: {}
        };
        jrhPreviousStationSafeSegmentModels[segmentKey] = model;
    }

    let serviceKey = jrhPreviousStationSafeServiceKey(arrival);
    model.samples[serviceKey] = {
        travelMs: travelMs,
        observedAtMs: currentTimeMs
    };

    let keys = Object.keys(model.samples);
    if(keys.length > jrhPreviousStationSafeSampleLimit) {
        keys.sort(function(a, b) {
            return model.samples[a].observedAtMs - model.samples[b].observedAtMs;
        });
        while(keys.length > jrhPreviousStationSafeSampleLimit) {
            delete model.samples[keys.shift()];
        }
    }
}

function jrhPreviousStationSafeGetSegmentEstimate(routeId, previousPlatformId, currentPlatformId) {
    let model = jrhPreviousStationSafeSegmentModels[
        jrhPreviousStationSafeSegmentKey(routeId, previousPlatformId, currentPlatformId)];
    if(model == null) {
        return null;
    }
    let values = [];
    for(let serviceKey in model.samples) {
        let sample = model.samples[serviceKey];
        if(sample != null && isFinite(sample.travelMs)) {
            values.push(sample.travelMs);
        }
    }
    return jrhPreviousStationSafeMedian(values);
}

/** 未学習区間向けに、同じrouteで学習済みの各区間中央値から代表値を作る。 */
function jrhPreviousStationSafeGetRouteEstimate(routeId) {
    let values = [];
    let routeIdText = String(routeId);
    for(let segmentKey in jrhPreviousStationSafeSegmentModels) {
        let model = jrhPreviousStationSafeSegmentModels[segmentKey];
        if(model == null || model.routeId != routeIdText) {
            continue;
        }
        let segmentValues = [];
        for(let serviceKey in model.samples) {
            let sample = model.samples[serviceKey];
            if(sample != null && isFinite(sample.travelMs)) {
                segmentValues.push(sample.travelMs);
            }
        }
        let segmentMedian = jrhPreviousStationSafeMedian(segmentValues);
        if(segmentMedian != null) {
            values.push(segmentMedian);
        }
    }
    return jrhPreviousStationSafeMedian(values);
}

function jrhPreviousStationSafeFallbackMs() {
    return numberOrDefault(
        SCRIPT_INPUT.previousStationFallbackSeconds,
        jrhPreviousStationSafeDefaultFallbackSeconds) * 1000;
}

/**
 * 既存rendererから呼ばれる関数を安全実装へ差し替える。
 * 優先順位: 前駅PIDSの同一便観測 > 駅間学習値 > 一意な前駅観測 > route学習値 > 固定fallback。
 */
updatePreviousStationDepartureCache = function(arrivals, state, currentTimeMs) {
    jrhPreviousStationSafeCleanup(currentTimeMs);
    jrhPreviousStationSafeObserve(arrivals, currentTimeMs);

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
                departureLocked: false,
                displayStartedAtMs: null,
                displayCompleted: false,
                source: null,
                lastSeenAtMs: currentTimeMs
            };
            store[key] = record;
        }
        record.lastSeenAtMs = currentTimeMs;

        if(record.departureTimeMs != null && currentTimeMs >= record.departureTimeMs) {
            record.departureLocked = true;
        }
        if(record.departureLocked) {
            continue;
        }

        let routeMetadata = jrhGetRoutePlatformMetadata(arrival, currentTimeMs);
        let previousPlatformId = routeMetadata == null ? null : routeMetadata.previousPlatformId;
        if(previousPlatformId == null) {
            jrhPreviousStationDebug(state, key,
                "safe estimate: previous platform not found: route=" + arrival.routeId() +
                " platform=" + arrival.platformId());
            continue;
        }

        let currentArrivalTimeMs = jrhPreviousStationSafeNumber(arrival.arrivalTime());
        if(currentArrivalTimeMs == null) {
            continue;
        }

        let observation = jrhPreviousStationSafeFindObservation(
            arrival, previousPlatformId, currentTimeMs);
        let segmentEstimateMs = jrhPreviousStationSafeGetSegmentEstimate(
            arrival.routeId(), previousPlatformId, arrival.platformId());

        if(observation != null && observation.exactMatch) {
            // schedule値同士でも駅間時間の学習には使える。表示は列車がrealtimeになってから行う。
            jrhPreviousStationSafeLearnSegment(
                arrival, previousPlatformId, observation.travelMs, currentTimeMs);
            if(observation.realtime || Boolean(arrival.realtime())) {
                record.departureTimeMs = observation.departureTimeMs;
                record.source = "observed-exact";
            }
        } else if(segmentEstimateMs != null && Boolean(arrival.realtime())) {
            record.departureTimeMs = currentArrivalTimeMs - segmentEstimateMs;
            record.source = "segment-model";
        } else if(observation != null && Boolean(arrival.realtime())) {
            record.departureTimeMs = observation.departureTimeMs;
            record.source = "observed-unique";
        } else if(Boolean(arrival.realtime())) {
            let routeEstimateMs = jrhPreviousStationSafeGetRouteEstimate(arrival.routeId());
            let travelMs = routeEstimateMs == null
                ? jrhPreviousStationSafeFallbackMs()
                : routeEstimateMs;
            record.departureTimeMs = currentArrivalTimeMs - travelMs;
            record.source = routeEstimateMs == null ? "fallback" : "route-model";
        } else {
            // 時刻表だけでは「発車済み」と断定しない。exact観測が取れれば学習だけ進める。
            record.departureTimeMs = null;
            record.source = "waiting-realtime";
        }

        if(record.departureTimeMs != null && !isFinite(record.departureTimeMs)) {
            record.departureTimeMs = null;
            record.source = null;
        }

        if(record.departureTimeMs != null) {
            jrhPreviousStationDebug(state, key,
                "safe estimate(" + record.source + "): route=" + arrival.routeId() +
                " departureIndex=" + arrival.departureIndex() +
                " previousPlatform=" + previousPlatformId +
                " departureTime=" + record.departureTimeMs);
        }
    }

    for(let key in store) {
        let record = store[key];
        if(record == null || currentTimeMs - record.lastSeenAtMs > jrhPreviousStationStateKeepMs) {
            delete store[key];
            if(state.jrhPreviousStationDebug != null) {
                delete state.jrhPreviousStationDebug[key];
            }
            if(state.jrhPreviousStationErrors != null) {
                delete state.jrhPreviousStationErrors[key];
            }
        }
    }
};
