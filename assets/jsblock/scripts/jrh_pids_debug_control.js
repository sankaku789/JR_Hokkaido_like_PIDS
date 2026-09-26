/* JR北海道風PIDS デバッグログ制御。 */

const JRH_DEBUG_LOG_ENABLED = false;

if(!JRH_DEBUG_LOG_ENABLED) {
    jrhPreviousStationDebug = function(state, key, message) {
    };

    jrhPreviousStationHttpLogFailure = function(message) {
        jrhPreviousStationHttpLastFailure = String(message);
    };

    jrhPreviousStationHttpLogResponseMode = function(path, mode) {
        jrhPreviousStationHttpResponseModes[path] = mode;
    };

    jrhPreviousStationDiag = function(key, message) {
        try {
            jrhPreviousStationDiagLast.put(String(key), String(message));
        } catch(e) {
        }
    };
}
