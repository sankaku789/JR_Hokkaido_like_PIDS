/* JR北海道風ホーム発車標（通常色）。 */

include(Resources.id("jsblock:scripts/jrh_pids_common.js"));
include(Resources.id("jsblock:scripts/jrh_pids_home_renderer.js"));

const jrhHomeTheme = {
    defaultBackground: 0x05051F,
    showRouteColor: false,
    header: 0xF4F4FF,
    noTrain: 0x16FF35,
    warning: 0xFF1800,
    route: 0x16FF35,
    departure: 0x16FF35,
    destination: 0x16FF35,
    platform: 0xFF9D00,
    message: 0x16FF35,
    stops: 0xFF9D00,
    outOfService: 0x16FF35
};

/** 通常色ホーム発車標の描画状態を初期化する（初期化処理なし）。 */
function create(ctx, state, pids) {
}

/** 通常色テーマでホーム発車標を描画する。 */
function render(ctx, state, pids) {
    jrhHomeRender(ctx, state, pids, jrhHomeTheme);
}

/** 通常色ホーム発車標の描画資源を解放する（解放処理なし）。 */
function dispose(ctx, state, pids) {
}
