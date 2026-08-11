# Project Overview

## 目的
JR北海道風の発車標をMinecraftへ追加するリソースパック。MTR 4の列車情報をJoban Client Mod v2 (JCM) のPIDS JavaScript APIで描画し、ホーム向け2段表示とコンコース向けLCD 4段表示を、3色LED風・フルカラーの2テーマで提供する。

## 技術スタック
- Minecraft 1.20.1 resource pack (`pack_format: 15`)
- MTR 4 + Joban Client Mod v2
- JCM組み込み環境で実行されるJavaScript
- JSONによるpreset/resource登録、PNG/font assets
- GitHub Actionsによるタグrelease zip作成

## 主要構成
- `assets/jsblock/joban_custom_resources.json` — 4つのPIDS presetと`SCRIPT_INPUT`既定値
- `assets/jsblock/scripts/jrh_like_pids*.js` — 各テーマの入口。共通scriptをincludeしthemeを渡す
- `assets/jsblock/scripts/jrh_pids_common.js` — 色・font・文字描画・時刻整形などの共通helper
- `assets/jsblock/scripts/jrh_pids_home_renderer.js` — ホーム2件表示、到着警告、追加message
- `assets/jsblock/scripts/jrh_pids_lcd_renderer.js` — LCD最大3列車、停車駅案内、追加message交互表示
- `assets/jsblock/font/`, `assets/jsblock/textures/` — 描画assets
- `README*.md`, `HOWTO*.md` — 利用条件・操作仕様

## 主要な探索起点
- `jrh_like_pids.js` / `jrh_like_pids_fc.js` — `render`, `jrhHomeTheme`
- `jrh_like_pids_lcd.js` / `jrh_like_pids_lcd_fc.js` — `render`, LCD theme
- `jrh_pids_home_renderer.js` — `jrhHomeRender`
- `jrh_pids_lcd_renderer.js` — `jrhLcdRender`
- `jrh_pids_common.js` — shared drawing/data helpers

## よく使うコマンド
- 開発時再読込: Minecraft内で`F3 + T`
- 差分確認: `git status --short`, `git diff -- <paths>`
- Release: `v*`タグpush時にGitHub Actionsがzipを作成
- 自動test/lint/typecheck/build: repositoryには未設定

## 重要な境界・規約
- JCM runtime globals (`Resources`, `Text`, `Texture`, `SCRIPT_INPUT`, `pids`) に依存し、通常のNode/browser moduleではない。
- 4テーマは共通rendererを共有するため、共通挙動はrenderer側、配色差はentry theme側に保つ。
- JCM collectionは`get(i)`や`size()`を使うJava風APIの場合がある。JS array操作前にコピーする。
- Layout、font、scale、theme色、row hidden/platform hidden、custom messageなどは明示要求なしに変更しない。
- 未コミットのユーザー変更が存在し得るため、無関係な差分をrevertしない。

## 注意点
- 実表示の最終確認にはMinecraft + JCM環境が必要。
- README記載の設定変更は`joban_custom_resources.json`編集後に`F3 + T`で反映する。