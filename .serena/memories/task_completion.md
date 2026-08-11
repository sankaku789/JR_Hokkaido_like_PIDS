# Task Completion

- No automated project test/lint/typecheck suite is configured.
- Review `git diff -- <affected paths>` and verify only requested behavior changed.
- Run an available JavaScript syntax check when it can parse JCM scripts; otherwise perform static inspection because runtime globals are supplied only by JCM.
- Validate preset registration JSON if edited.
- User-visible rendering changes require Minecraft/JCM verification after `F3 + T`, including all affected home/LCD and color themes.