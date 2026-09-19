# Conventions
- JavaScript uses 4-space indentation, semicolons, `let`/`const`, and camelCase names.
- Shared PIDS behavior belongs in `jrh_pids_common.js`; layout-specific drawing remains in the corresponding home/LCD renderer.
- Multilingual display strings use `|` separators and are selected with `currentLanguage`.
- Script input defaults are declared per preset in `joban_custom_resources.json` and documented in README files when user-configurable.