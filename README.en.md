# JR Hokkaido Style PIDS

[日本語](README.md) | English

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

Edit `scriptInput` in `assets/jsblock/joban_custom_resources.json` to customize the presets.

Available options:

- `directionText`: Header text shown when the PIDS message field is empty
- `noTrainText`: Text shown when no train is available
- `backgroundColor`: Background color as a hexadecimal RGB value
- `arrivalWarningSeconds`: Seconds before arrival when the arrival warning starts
- `arrivalWarningBlinkIntervalMs`: Arrival warning blink interval in milliseconds
- `arrivalWarningText`: Arrival warning message

## License

This resource pack is distributed under CC BY-NC-SA 4.0.
