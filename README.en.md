# JR Hokkaido Style PIDS

[日本語](README.md) | English | [简体中文](README.cn.md)

This resource pack adds PIDS presets inspired by JR Hokkaido departure boards.

Included styles:

- Three-color LED style, inspired by Sapporo and Shin-Sapporo stations
- Full-color LED style, inspired by Eniwa and New Chitose Airport stations

Both concourse-facing and platform-facing variants are included.

## Requirements

- Minecraft Transit Railway 4
- Joban Client Mod v2

## Tested Environment

- Minecraft 1.20.1
- Forge 47.4.10

## Usage

See [HOWTO.en.md](HOWTO.en.md).

After changing this resource pack or its `scriptInput` values, reload resources with `F3 + T`.

## Notes

- Text other than the clock is scaled down when it is too long. Long messages, station names, or destination names may become small.
- When MTR custom fonts are enabled, PIDS text uses Minecraft Unifont through a resource-pack font definition.
- If MTR custom fonts are disabled, JCM ignores `Text.font(...)`; in that case the display falls back to the client's normal font behavior.
- Clock and platform-number text is stretched into fixed-width boxes to reduce layout differences between font settings.

## Customization

Edit `scriptInput` for each preset in `assets/jsblock/joban_custom_resources.json` to customize the following options:

- `backgroundColor`: Background color as a hexadecimal RGB value (three-color: `05051F`; full-color: `1D2053`)
- `arrivalWarningSeconds`: Seconds before the platform-display arrival warning starts (default: `25`; unused by the LCD renderer)
- `arrivalWarningBlinkIntervalMs`: Platform-display arrival warning blink interval in milliseconds (default: `700`; unused by the LCD renderer)
- `languageSwitchIntervalMs`: Interval for switching `|`-separated languages in milliseconds (default: `5000`)
- `messageMarqueeSecondsPerCharacter`: Seconds per approximate character width used to control long-message scrolling speed (default: `0.33`; smaller values scroll faster)
- `arrivalWarningText`: Platform-display arrival warning message (default: `列車がまいります。`; unused by the LCD renderer)
- `outOfServiceText`: Out-of-service train text; supports `|`-separated languages (default: `回送|Out Of Service`)
- `directionText`: Header text shown when the PIDS message field is empty (default: `発車ご案内 Train Infomation`)
- `noTrainText`: Text shown when no train is available (default: `調整中`)

## License

This resource pack is distributed under CC BY-NC-SA 4.0.
