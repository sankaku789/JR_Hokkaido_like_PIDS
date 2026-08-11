# Conventions

- Use 4-space indentation, semicolons, `let`/`const`, and lower camelCase functions/locals; shared constants are uppercase, renderer-specific constants use lower camelCase.
- Public JCM lifecycle functions are `create`, `render`, and `dispose`; theme entry scripts remain thin and delegate to shared renderers.
- Japanese JSDoc/comments describe display behavior; comments should explain non-obvious runtime/layout rules rather than syntax.
- Drawing uses shared helpers (`rectangle`, `drawText`, `createPidsText`) and theme color objects. Preserve coordinates, scaling, font, and text fitting unless layout is explicitly in scope.
- Treat JCM collections as Java-like (`get(i)`, sometimes `size()`), not necessarily JavaScript arrays. Copy into a JS array before using array operations such as `sort` or `slice`.
- The worktree may contain user changes. Never revert or overwrite unrelated modifications.