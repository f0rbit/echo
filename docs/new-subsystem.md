# Playbook — scaffolding a new subsystem

> **Follow this step-by-step when starting `boss` (Phase 6), the `hub` subsystem (Phase 7), or `main` (Phase 8).** Do not improvise the scaffold — every step below encodes a trap that already fired once. Read `docs/architecture.md`, `docs/rendering.md`, `docs/persistence-replay.md`, and `docs/forge.md` before starting; this playbook references them constantly.

## Step 0 — plan calibration

1. Read the subsystem's spec in `PLAN.md` §4.x and its phase table in §7.
2. **Multiply the §7 LOC budget by 2.5–3×.** Empirical: arena landed at 2.6× of an 810 budget; loot at 3.17× of an 890 budget. §7 doesn't size tests + debug fixtures as separate columns and collapses "X system" rows that ship as 2–3 separate testable systems. Break the phase into "core code / tests / debug fixture" columns before planning. This is a recurring planning failure mode, not noise. See `subsystems/arena/PLAN.md` §5 and `subsystems/loot/PLAN.md` §5.
3. Consult the **promotion candidates tracker** in `docs/forge.md` — it names which existing files this subsystem is expected to copy and which forge bump (if any) is planned alongside the phase.

## Step 1 — lock the scaffold-time decisions

Write the answers into the subsystem's `PLAN.md` (or FRICTION.md §0) before any code:

| Decision | Options | Canonical example |
|----------|---------|-------------------|
| Visual identity | none — palette / fonts / mood / shell / HUD / juice are fixed by contract | `docs/design-language.md` |
| Movement model | cell-step vs continuous — **never mix** | cell-step: `progress`; continuous: `arena` |
| `dir_c` write pattern (cell-step only) | every-tick (no directional ability) vs nonzero-only (melee/ranged/facing) | loot vs progress — see `docs/architecture.md` |
| Game shell? | menu/won/lost FSM or bare | `arena` (FSM), copy its `fsm.ts` + `game-state.ts` |
| Pause gates | which resource gates gameplay systems (`paused_r`, `hitstop_r`, FSM state) | `progress` level-up pause |
| What gets copied from where | chaser AI ← bestiary/progress; `fsm.ts` ← arena; `src/ui/` ← progress; `disk-save.ts` + `localstorage_store` ← progress | see `docs/architecture.md` copy conventions |
| Snapshot surface | which resources are dynamic (snapshotted) vs static config (rehydrated) vs transient (closures) | see `docs/persistence-replay.md` table |

**Pre-scaffold checklist — enumerate stat-modifier fields before `components.ts`.** Read every system you're about to scaffold for and enumerate every stat / state-modifier field referenced. Progress's `xp_gain_mul` perk needed `stats_c.xp_gain_mul`; the Phase 5.0 scaffold missed it and Phase 5.2 had to amend `components.ts` mid-implementation. Trivially preventable with a pre-read pass (progress FRICTION.md §3).

## Step 2 — scaffold the package

Copy from `subsystems/progress/` (the most complete example) and adjust:

1. `mkdir subsystems/<name>` — the root `workspaces: ["subsystems/*", "hub"]` glob picks it up automatically. **Exception — `main/`:** it is NOT in `workspaces` until Phase 8 (bun rejects an empty workspace directory at install time). When Phase 8 starts and `main/package.json` exists, add `"main"` back to the root `workspaces` array. The `main:build` and Pages-deploy steps already detect `main/package.json` and skip gracefully when absent.
2. `package.json` — copy progress's, rename, trim the `debug-gui` build steps if not needed yet. Dependencies come from **npm**: `@f0rbit/forge` (never workspace symlink), `pixi.js` `^8`, `@f0rbit/corpus`, `zod`. Keep the `dev` / `build` / `serve` / `test` / `typecheck` script shape.
3. `tsconfig.json` — copy from a sibling verbatim.
4. `index.html` — copy a sibling's; keep the canonical shape from `PLAN.md` §6. If using a pixel font, include the Google Fonts `<link>` triplet (see `docs/rendering.md`).
5. `debug.html` — must reference `./main.js`, NOT `./main-debug.js` (build-time rename — see `docs/rendering.md` "Debug build pipeline rename").
6. `public/` — copy `walls-autotile.{png,json}` + the 0x72 atlas from a sibling. Duplication per subsystem is intentional (no `@echo/shared`).
7. Root `package.json` — add a `serve:<name>` script mirroring the existing ones.
8. `src/` layout (match progress): `components.ts`, `resources.ts`, `bindings.ts`, `grid.ts`, `plugin.ts`, `main.ts`, `snapshot.ts`, `systems/`, `data/`, plus `main-debug.ts` + `debug-plugin.ts` when the debug fixture lands.

Static-only constraint: GitHub Pages can't run server functions. `bun build --target browser`, static `index.html` + `dist/main.js`. No SSR anywhere.

## Step 3 — boot conventions

In `main.ts` (and every debug entry point):

1. `await document.fonts.load("8px 'Press Start 2P'")` BEFORE `boot()` if using a pixel font (every entry point, fresh font registry per page — progress FRICTION.md §26).
2. `await load_ui_assets()` BEFORE `boot()` if using 9-slice UI.
3. `boot({ debug: is_dev(), app_id: "<name>", ... })` — `is_dev()` from `@f0rbit/forge/debug`; debug fixtures hard-code `debug: true`.
4. Tiled floors in every cell + perimeter walls via `@f0rbit/forge/autotile`, explicit z (1/2/3) — see `docs/rendering.md`.
5. If shipping a game shell: overlays as `surface_sprite` siblings via `addChildAt`, FSM owns `setup_<name>` (NOT called at boot) — see `docs/architecture.md`.

## Step 4 — tests + replay fixture

1. Seed helpers in `test/fixtures/<name>-scenario.ts` — `harness.tick()` only runs `update`; set resources + spawn entities directly (see `docs/persistence-replay.md`).
2. Replay-as-test with explicit timeout (`REPLAY_TIMEOUT_MS = 30000` as third arg to `test()`).
3. World-hash via `canonical_stringify`; restore targets boot first (`make_restore_target` pattern).
4. Record the fixture via the in-page recorder on a served production build; store under `replays/`.

## Step 5 — debug fixture(s)

One fixture per visual/stateful concern (see `docs/rendering.md` "Debug fixture pattern"). Build-script entries follow the rename recipe. The deploy step picks up every `dist/**` subdirectory automatically — no `pages.yml` change needed.

## Step 6 — definition of done

- [ ] `bun run verify` green from the repo root (typecheck all + tests + builds).
- [ ] Replay fixture recorded, `expected_hash` locked, replay test green.
- [ ] Visual smoke on the served production build per `docs/verification.md` (curl freshness check + `__forge` screenshot).
- [ ] `subsystems/<name>/FRICTION.md` started (Status section + numbered friction entries).
- [ ] New durable patterns written into the matching `docs/*.md` file; AGENTS.md status section updated.
- [ ] Promotion tracker in `docs/forge.md` updated if this subsystem became consumer #2/#3 of anything.

## Deploy / URL conventions (for reference)

- Hub landing: `https://f0rbit.github.io/echo/` (the `hub/` Astro site).
- Subsystems: `https://f0rbit.github.io/echo/<name>/` — **flat**, no `subsystems/` segment; the deploy step aggregates `subsystems/<name>/dist/` to `_site/<name>/`.
- Composed game: `https://f0rbit.github.io/echo/main/` (Phase 8).
- Push to `main` branch triggers `.github/workflows/pages.yml` (build → aggregate → deploy).
- Naming clash: `hub/` (Astro landing) vs `subsystems/hub/` (Phase 7 NPC/dialogue subsystem). Directory paths are unambiguous; if the clash bites in conversation, the landing site renames to `/site/` later (PLAN.md §3).
