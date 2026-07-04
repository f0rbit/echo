@~/.claude/AGENTS.md

# echo — agent notes

`echo` is an infinite dungeon crawler built on `@f0rbit/forge`. The repo is a bun-workspaces monorepo of seven small playable subsystems (`subsystems/<name>/`) plus a composed final game (`main/`) and a static landing site (`hub/`). Full scoping document: [`PLAN.md`](./PLAN.md). Deep conventions live in [`docs/`](./docs/) — the routing table below tells you which file to read for your task. **The docs are load-bearing: nearly every rule in them is a bug that already shipped once.**

## Status

> Maintained by the verification coder at each phase commit. Last updated: 2026-07-04.

- **Done:** Phases 0–5 — `dungeon-walk`, `bestiary`, `arena`, `loot`, `progress` all live, plus the 5.9.x polish pass (floors/walls/lighting everywhere, arena game shell, pixel-font UI). All subsystems on forge v0.5.4.
- **Next:** Phase 6 — `boss` (scripted 3-phase fight; expect the `forge.script` DSL work, see `PLAN.md` §4.6). Then Phase 7 `hub` subsystem, Phase 8 `main`.
- **Watch out:** `main/` is NOT in root `workspaces` until Phase 8 (bun rejects empty workspace dirs). Open cross-repo items live in `.plans/backlog.md`.

## Repo layout + URLs

```
echo/
├── hub/                   # Astro static landing — deployed at f0rbit.github.io/echo/
├── subsystems/<name>/     # bun-bundled mini-games — deployed at /echo/<name>/ (flat URL, no "subsystems/" segment)
├── main/                  # composed game — /echo/main/ (Phase 8)
├── docs/                  # agent-facing conventions + playbooks (see routing table)
├── tools/                 # serve-dist.ts, atlas generators
└── .github/workflows/pages.yml   # push to main → build → aggregate to _site/ → Pages deploy
```

Static-only — GitHub Pages runs no server code. Naming clash: `hub/` (landing site) ≠ `subsystems/hub/` (Phase 7 NPC/dialogue subsystem).

## Commands

```sh
bun install                 # all workspaces
bun run verify              # typecheck (hub + all subsystems) + bun test + build:all — THE definition of done
bun test                    # all replay-as-test fixtures (root)
bun run build:all           # hub + subsystems + main
bun run serve:<name>        # serve a built subsystem's dist/ on :4567 (production smoke; NOT `dev`)
bun run hub:dev             # Astro landing at localhost:4321/echo/
```

## What to read before you touch anything (MANDATORY)

Match your task against this table and read the listed docs **in full, before writing code**. Do not skip because the task "looks simple" — these files exist because simple-looking tasks shipped bugs.

| If your task involves… | Read first |
|---|---|
| Scaffolding `boss` / `hub` subsystem / `main`, or any new package | `docs/new-subsystem.md` (it chains the others) |
| Gameplay systems: movement, AI, combat, XP, pause, FSM, input | `docs/architecture.md` |
| Anything visual: sprites, text, HUD, modals, lighting, camera, juice, debug fixtures | `docs/design-language.md` (the contract — palette, fonts, moods, shell, HUD, juice bar) then `docs/rendering.md` (the recipes) |
| Saves, snapshots, RNG, replays, `bindings.ts`, anything in `test/` | `docs/persistence-replay.md` |
| Any forge ECS code at all (queries, spawn/despawn, resources) | `docs/forge.md` "API gotchas" (2 min, always) |
| Verifying / committing / finishing a task | `docs/verification.md` |
| Something behaving wrongly | `docs/troubleshooting.md` (symptom-indexed — check before debugging from scratch) |
| Working inside an existing subsystem | that subsystem's `FRICTION.md` + `PLAN.md` |

**Orchestrators:** when spawning a coder for echo work, name the required docs in the brief, e.g. — *"Before coding, read `docs/architecture.md` and `docs/forge.md` §API gotchas; verify per `docs/verification.md`."* Explore/Plan agents don't auto-load this file, so give them the pointers explicitly.

## Hard invariants

One line each; the linked doc has the full recipe and the war story. Violating any of these reintroduces a fixed bug.

**Structure**
- No `@echo/shared` — subsystems never import from each other; duplication + `// FORGE-PROMOTION-CANDIDATE` headers instead (`docs/architecture.md`).
- `@f0rbit/forge` always from npm, never workspace-symlinked; forge-minor drift between subsystems is fine until Phase 8 (`docs/forge.md`).
- PLAN.md §7 LOC budgets understate by 2.5–3× — re-baseline before planning any phase (`docs/new-subsystem.md` step 0).

**Simulation**
- Never `time.scale = 0` for pauses — gate resources + early returns (`docs/architecture.md`).
- Movement reads live input (`ctx.input.vector`); `dir_c` is ability-facing only (`docs/architecture.md`).
- One movement model per subsystem — cell-step XOR continuous, chosen at scaffold time (`docs/architecture.md`).
- Emit-side hit-event consumers (particles, flash) must NOT gate on hitstop (`docs/architecture.md`).
- Real-time melee vs sacrifice-on-contact needs a swing window, not edge-triggers (`docs/architecture.md`).

**Persistence / replay**
- Static config out of the snapshot (rehydrate at startup); transient state in factory closures, not resources (`docs/persistence-replay.md`).
- Never closure-capture `ctx.rng.fork()` — re-fork per tick with a tick-suffixed label (`docs/persistence-replay.md`).
- `Snapshotter.restore()` is destructive — boot the target first (`docs/persistence-replay.md`).
- Changed rng-consuming setup ⇒ re-record the replay fixture (`docs/persistence-replay.md`).

**Forge API**
- Marker components are elided from query tuples; `despawn` not `delete` (returns `Result`); resources on `ctx.res` not `world.res`; `world.spawn(...)` is variadic — no outer array (`docs/forge.md`).

**Rendering**
- `pos_c` is the cell CENTER — never add `tile/2` (`docs/rendering.md`).
- Game UI on `app.stage` as `surface_sprite` sibling via `addChildAt` — never in `app.render.world` (`docs/rendering.md`).
- Two text recipes — crisp (`resolution: 4` + halve-scale) vs pixel font (`resolution: 1`, never scaled); they are opposites (`docs/rendering.md`).
- `await document.fonts.load(...)` + `await load_ui_assets()` before `boot()`, in every entry point (`docs/rendering.md`).
- Camera shake only via `app.render.set_screen_offset` (`docs/rendering.md`).

**Verification**
- `bun run verify` green before any commit; `curl` the served port before trusting a screenshot (`docs/verification.md`).

## Documentation maintenance

These files are living documents, written directly by agents — no approval gate, no staging files (the old `PROPOSED-AGENTS-UPDATES.md` flow is retired; write straight into the target doc).

1. Fresh friction → numbered entry in `subsystems/<name>/FRICTION.md` (terse, cite files + commits).
2. Durable pattern or trap → the matching `docs/*.md` file; add a `docs/troubleshooting.md` row if it has a recognisable symptom.
3. New invariant class → one line in "Hard invariants" above + a routing-table row if a new task type emerged.
4. Phase done → update **Status** above; update the promotion tracker in `docs/forge.md` when consumer counts change.
5. Wrong/stale entry found anywhere → fix or delete it on the spot.

Keep this file under ~150 lines — it is auto-loaded into every session; depth belongs in `docs/`.
