# Usage

Train information is displayed in this order:

1. Departure time
2. Train type / route number in MTR
3. Destination
4. Departure or arrival platform

![No track display](fig/no-track-display.png)

If a train's track is not set in MTR, the platform field is left blank.

## Header Message

The text shown as `Sapporo direction` in the screenshot is the header message.

![Header message](fig/enable-msg.png)

To set it in-game, enable the custom message field in the PIDS settings and enter the message text there. If the message is empty, the preset falls back to `directionText` from `scriptInput`.

## Arrival Warning

When a train is close to arrival, the second row can switch to the arrival warning message.

![Arrival warning](fig/arrival.png)

The warning behavior is controlled by these `scriptInput` values:

- `arrivalWarningSeconds`: Seconds before arrival when the warning starts
- `arrivalWarningBlinkIntervalMs`: Blink interval in milliseconds
- `arrivalWarningText`: Text shown during the warning

## Hiding the Platform

If the MTR PIDS setting hides the platform number, this preset also hides the platform field and gives the destination field more space.
