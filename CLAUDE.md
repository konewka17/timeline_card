# Project Instructions for Claude Code

## Comments

- Default to writing **zero comments**. Only add one when the *why* is genuinely
  non-obvious — a hidden constraint, a workaround for a library limitation, a
  non-trivial tradeoff. If a comment is needed to explain *what* the code does,
  the naming is wrong — fix the naming instead.
- Never reference previous versions, previous mistakes, previous prompts, or
  why the current approach is better than some other approach. That other
  approach no longer exists in the code, so it's irrelevant to anyone reading it.
- Never narrate the history of a decision (e.g. "This used to be X, but that
  didn't work, so now it's Y"). Describe only the current state.
- Don't leave a trail of your reasoning process in the code. The commit
  message or PR description is the place for that — not the source file.
- When you need to write comments, do so in concise telegram style, not in full
  full conversational style.

Bad:
```
// Previous approach used a global font setting, but that didn't work because
// CanvasJS doesn't support one, so each helper below sets the font explicitly.
```

Good (short, only the non-obvious constraint, nothing else):
```
// CanvasJS has no global font option; set per element.
```

If in doubt, prefer no comment at all over a short one.

## Error handling

- Don't add try/catch, null checks, or fallback branches for cases that
  cannot occur in this codebase. Defensive code for hypothetical inputs
  masks real underlying failures or runtime exceptions and adds noise.
- Only handle errors that can actually happen given how this code is called.

## Abstraction and scope

- Don't introduce abstraction layers, config objects, or generic helpers for a
  single use case. Wait until there are at least two distinct real call sites
  before generalizing.
- Don't add unneccessary constants that can also be hardcoded in functions. Only
  add them if it's obvious the constant is used in many different places and hardcoding it
  everywhere adds real risk.
- Don't add extensibility "for later" (extra parameters, feature flags,
  plugin-style hooks) unless it was asked for.
- When refactoring, remove the old code completely. Don't leave dead code,
  commented-out blocks, or backwards-compatibility shims around unless
  explicitly asked to keep them.

## Change size and style

- Keep changes focused on what was asked. Don't opportunistically refactor,
  rename, or reformat unrelated code in the same edit.
- Don't add logging or print statements for debugging and then leave them in.
- Match the existing code style in the file you're editing and related files
  over any general preference.

## Tests

- Keep testing to a minimum
- Don't spin up test servers for every minor change.

## Home Assistant map code

The map runs on Home Assistant's own map engines, kept in `src/ha-frontend/`.
Read `src/ha-frontend/README.md` before changing anything map-related.

- Don't edit files under `src/ha-frontend/`. Changes to what HA's code does go in
  `src/ha-extensions/`, as subclasses of HA's classes.
- Before writing map code, check whether HA's frontend already does it, and take it
  from there. Check the upstream history too: something HA seems to lack may have
  been dropped on purpose.
- Our own map code is only for the deviations listed in that README. Each time you
  touch it, look at whether it can get simpler.
- Syncing with upstream: follow `docs/syncing-ha-frontend.md`.

## If you're unsure

If a request is ambiguous, make the smallest reasonable assumption, state it
in one line, and proceed — don't pad the code with comments explaining the
assumption instead.