# Core

- Minecraft resource pack adding JR Hokkaido-style PIDS displays for MTR 4 + Joban Client Mod v2.
- Four preset entry scripts under `assets/jsblock/scripts/`: home/LCD x three-color/full-color. Entry scripts define themes and include shared renderer/common scripts.
- Shared behavior lives in `jrh_pids_common.js`, `jrh_pids_home_renderer.js`, and `jrh_pids_lcd_renderer.js`; preserve theme entry scripts when changing behavior shared across color variants.
- JCM supplies runtime globals/APIs such as `Resources`, `Text`, `Texture`, `SCRIPT_INPUT`, and `pids`; scripts are not standalone browser/Node modules.
- Presets and user-configurable defaults are registered in `assets/jsblock/joban_custom_resources.json`.
- User-facing project map: `mem:project-overview`. Toolchain details: `mem:tech_stack`. Code conventions: `mem:conventions`. Completion checks: `mem:task_completion`.