# Task completion
- Run `env -u NODE_OPTIONS node --check` on every changed JavaScript file.
- Review `git diff --ignore-space-at-eol` because working files may use CRLF while the Git baseline uses LF.
- Runtime/API and visual behavior require Minecraft verification after `F3 + T`; there is no automated test suite.