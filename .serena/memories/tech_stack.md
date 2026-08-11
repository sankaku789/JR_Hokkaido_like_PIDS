# Tech Stack

- Minecraft 1.20.1 resource pack (`pack_format: 15`).
- Runtime dependencies: MTR 4 and Joban Client Mod v2.
- JavaScript executed by JCM's scripting environment; no package manager, transpiler, framework, or declared Node dependency.
- JSON resource/preset metadata and PNG/font assets.
- GitHub Actions release workflow packages `pack.mcmeta`, `pack.png`, and `assets` into a zip on `v*` tags.