/* JR北海道風ホーム発車標（フルカラー）。 */

include(Resources.id("jsblock:scripts/jrh_pids_common.js"));
include(Resources.id("jsblock:scripts/jrh_pids_home_renderer.js"));

const jrhHomeFcTheme = {
    defaultBackground: 0x1D2053,
    showRouteColor: true,
    header: 0xF4F4FF,
    noTrain: 0x16FF35,
    warning: 0xFF1800,
    route: 0xFFFFFF,
    departure: 0xFFFFFF,
    destination: 0xFFFFFF,
    platform: 0xFFFF00,
    message: 0xFFD900,
    stops: 0x16FF35,
    outOfService: 0xFFFFFF
};

/** フルカラー版ホーム発車標の描画状態を初期化する（初期化処理なし）。 */
function create(ctx, state, pids) {
}

/** フルカラー版テーマでホーム発車標を描画する。 */
function render(ctx, state, pids) {
    jrhHomeRender(ctx, state, pids, jrhHomeFcTheme);
}

/** フルカラー版ホーム発車標の描画資源を解放する（解放処理なし）。 */
function dispose(ctx, state, pids) {
}
