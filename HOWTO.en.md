## Usage

Train information is displayed in the following order:

1. Train type (the route number in MTR)
2. Time
3. Destination
4. Arrival/departure platform

![alt text](fig/display.png)

The platform display shows up to two trains, while the concourse display shows up to three trains.

### Common Controls
The following controls are available for both presets.

**Changing the information header**

Enter text in the first PIDS message field to change the information header.

![alt text](fig/header-gui.png)

![alt text](fig/header.png)

The text `For Sapporo` in the screenshot is the information header.

If no text is entered, `発車ご案内 Train Infomation` is displayed.

![alt text](fig/init-header.png)

**Platform display**

The train's arrival/departure platform is displayed by default. Select `Hide platform` to disable it.

![alt text](fig/disable-track.png)

![alt text](fig/no-track-display.png)

**Message text display**

Enter text in the second PIDS message field to display it in the last train information row.

![alt text](fig/msg-gui.png)

![alt text](fig/msg.png)

![alt text](fig/msg-lcd.png)

Text containing 28 or more characters scrolls across the display.

![alt text](fig/scroll-text.png)

By default, the display switches between normal train information and the message every 15 seconds. For text containing 28 or more characters, it switches after the scrolling finishes. To display only the message, select `Hide destination, etc.` for the second PIDS message field.

![alt text](fig/enable-msg.png)

The two presets appear separately in the selection screen regardless of block type, and the selected preset determines the layout.

**Multilingual display**

If station names and route names are entered in MTR as multilingual strings separated by `|`, the preset parses them and switches the displayed language every five seconds.

![alt text](fig/another-lang.png)

To turn this feature off and use only the first language, select `Hide destination, etc.` for the third PIDS message field.

![alt text](fig/lang-trigger.png)

Station names and route names without multilingual input are displayed unchanged. Select this option only when you intentionally want to disable multilingual switching.

## Platform Display Behavior and Controls
On the platform display, `列車がまいります。` flashes from 25 seconds before a train arrives and disappears automatically when the train arrives. This warning takes priority over train information and message display.

![alt text](fig/arrival.png)

To disable the approaching-train warning, select `Hide destination, etc.` for the first message field.

![alt text](fig/arrival-disable.png)

If the calling-points text for the first train is too long, its font size is reduced to fit the display area.

On the LCD version, the fourth row displays the second message continuously when `Hide destination, etc.` is enabled for the second message field. When it is disabled, the row alternates between the third train and the message every 15 seconds.

## Concourse Display Behavior
The second row of the concourse display shows up to the next two calling points for the first train.

![alt text](fig/stop-at.png)
