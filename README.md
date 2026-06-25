# JR北海道風 発車標 PIDS
JR北海道風のデザインをした発車標を追加します。

- 3色LED準拠（札幌駅、新札幌駅）
- フルカラーLED準拠（恵庭駅、新千歳空港駅）

の2タイプを追加します。

また、コンコース向けとホーム向けがあります。

## 依存関係
次のmodが必要です。

- MTR 4 
- Joban Client Mod v2 

## 動作確認済み環境
次の環境でのテストは実施済みです。

- Minecraft1.20.1 + Forge47.4.10

## 使い方

[こちらをご覧ください。](HOWTO.md)

## 注意
時刻以外のテキストは文字数が長いと縮小されて表示されます。メッセージ、駅名などが長すぎると表示できても小さいことがありますので、ご注意ください。

## 変更したい場合

`assets/jsblock/joban_custom_resources.json` の `scriptInput` を編集することで、次の項目を設定することができます。

- `directionText`: PIDS側でメッセージが未入力の場合の上段案内（既定値: `発車ご案内 Train Infomation`）
- `noTrainText`: 列車がない場合の表示
- `backgroundColor`: 背景色の16進RGB値
- `arrivalWarningSeconds`: 到着警告を開始する到着前秒数
- `arrivalWarningBlinkIntervalMs`: 到着警告の点滅間隔（ミリ秒）
- `arrivalWarningText`: 到着警告の文章

編集後は `F3 + T` で再読み込みしてください。

## ライセンス
本リソースパックは、CC BY-NC-SA 4.0にて配布されます。