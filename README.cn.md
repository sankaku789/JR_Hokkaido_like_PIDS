# JR北海道风格 PIDS 发车信息屏

[日本語](README.md) | [English](README.en.md) | 简体中文

本资源包添加了采用 JR 北海道风格设计的发车信息屏。

- 三色 LED 风格（参考札幌站、新札幌站）
- 全彩 LED 风格（参考惠庭站、新千岁机场站）

共包含以上两种类型。

同时提供站厅用和站台用版本。

## 依赖项
需要安装以下模组：

- MTR 4
- Joban Client Mod v2

## 已测试环境
已在以下环境中进行测试：

- Minecraft 1.20.1 + Forge 47.4.10

## 使用方法

请参阅[此处](HOWTO.cn.md)。

## 注意事项
- 除时间外的文字过长时会缩小显示。消息、站名等内容过长时，虽然仍可显示，但文字可能会变得很小，敬请注意。
- 在 MTR 自定义字体已启用的环境中，PIDS 内的文字会使用 Minecraft Unifont。

## 自定义设置

编辑`assets/jsblock/joban_custom_resources.json`中各预设的`scriptInput`，可以设置以下项目：

- `backgroundColor`：背景颜色的十六进制 RGB 值（三色模式：`05051F`；全彩模式：`1D2053`）
- `arrivalWarningSeconds`：站台版在列车到达前多少秒开始显示到达提示（默认值：`25`；LCD 版不使用此项）
- `arrivalWarningBlinkIntervalMs`：站台版到达提示的闪烁间隔，单位为毫秒（默认值：`700`；LCD 版不使用此项）
- `languageSwitchIntervalMs`：切换以`|`分隔的多语言内容的间隔，单位为毫秒（默认值：`5000`）
- `messageMarqueeSecondsPerCharacter`：控制长消息滚动速度的每个近似字符宽度秒数（默认值：`0.33`；数值越小，滚动越快）
- `arrivalWarningText`：站台版的到达提示文字（默认值：`列車がまいります。`；LCD 版不使用此项）
- `outOfServiceText`：回送列车的显示文字，支持使用`|`分隔多语言内容（默认值：`回送|Out Of Service`）
- `directionText`：PIDS 消息未输入时显示的顶部提示（默认值：`発車ご案内 Train Infomation`）
- `noTrainText`：没有列车时显示的文字（默认值：`調整中`）

编辑后，请按`F3 + T`重新加载资源。

## 许可证
本资源包采用 CC BY-NC-SA 4.0 许可证发布。
