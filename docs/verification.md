# Playbook — verification

> **Run this at the end of every task and before every commit.** "It typechecks" is not verified. "The test passed" is not verified if you didn't also look at the running game when the change is visual. This playbook is mechanical on purpose — follow it top to bottom.

## 1. The one command

```sh
bun run verify
```

This runs, in order: hub typecheck (`astro check`) → every subsystem's `tsc --noEmit` → `bun test` (all replay-as-test fixtures) → `bun run build:all`. All four must pass. There is no partial credit — a red `verify` means the task is not done.

For focused iteration inside one subsystem:

```sh
cd subsystems/<name>
bun run typecheck && bun test && bun run build
```

but the task still ends with a root-level `bun run verify` (cross-subsystem breakage is real — e.g. a forge bump or a shared-asset change).

## 2. Visual smoke (mandatory for any visual change)

1. Build and serve the **production** build (not `bun run dev` — that's for source-watching):

   ```sh
   bun run serve:<name>          # from the repo root, serves dist/ on http://localhost:4567/
   # port taken? cd subsystems/<name> && bun ../../tools/serve-dist.ts dist <port>
   ```

2. **Verify the port is serving YOUR build before trusting any screenshot:**

   ```sh
   curl -s http://localhost:4567/ | head -5
   ```

   Any static server bound to an already-occupied port silently falls through to the **previous process** on that port — Chrome then screenshots stale content and the agent reads it as "the change didn't apply". If the response doesn't match the current `dist/index.html`: `lsof -i :4567` → `kill -9 <pid>` → re-serve. Bit phase 5.9.3; trivially preventable.

3. Screenshot + inspect via Chrome DevTools MCP using the forge debug surface (recipes in `docs/forge.md`):

   ```js
   await window.__forge.palette.run("dump-state")   // world + resources as text
   await window.__forge.app.screenshot()            // Blob from the live Pixi canvas
   await window.__forge.palette.run("pause"); await window.__forge.palette.run("step 5")
   ```

4. Judge the screenshot against the task's stated visual criteria (load the `visual-review` skill when the task has a visual-verification block). Check the obvious regressions: text crispness (see the text-recipe table in `docs/rendering.md`), modal brightness (lighting filter leak), z-order stacking, sprite offsets.

5. Debug fixtures (`/debug/`, `/debug-gui/`) are the fastest way to verify one concern in isolation — prefer them over playing the full game when they cover the change.

## 3. Replay integrity

- Changed anything rng-consuming in startup/pre (spawn order, shuffle, placement)? The replay fixture is now invalid — **re-record it** per `docs/persistence-replay.md` and update `expected_hash`. A green-but-stale replay is worse than a red one.
- Changed nothing rng-consuming and nothing in the world-hash projection? No re-record needed — confirm `bun test` stays green.

## 4. Commit

- Load the `git-workflow` skill for the commit template and checklist.
- Message style follows the existing log: `feat(progress): ...`, `fix(arena,loot): ...`, `docs(agents): ...`, `chore: ...`.
- One phase = one commit (per the global hard rules). Don't batch phases; don't skip the phase commit.
- Push to `main` triggers the Pages deploy (`.github/workflows/pages.yml`) — after merge, the live URL is the final smoke surface.

## 5. Documentation upkeep (part of done, not optional)

1. **New friction discovered?** Append a numbered entry to `subsystems/<name>/FRICTION.md` (terse, ordered by impact, cite files + commits).
2. **Durable pattern / trap that other subsystems will hit?** Write it directly into the matching `docs/*.md` file (architecture / rendering / persistence-replay / forge). No approval gate, no staging files — the old `PROPOSED-AGENTS-UPDATES.md` flow is retired.
3. **New invariant class?** Add a one-liner to the "Hard invariants" list in `AGENTS.md` pointing at the doc section.
4. **Phase completed?** Update the "Status" section in `AGENTS.md` (phase, date, next phase) and the promotion tracker in `docs/forge.md` if consumer counts changed.
5. Found an existing doc entry that's wrong or stale? Fix or delete it on the spot — these are living documents.
