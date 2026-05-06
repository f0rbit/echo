# echo — scoping document

> Status: scoping. No code written yet. The user reviews + approves this doc before any package scaffolding or devpad task creation.
>
> Audience: future Claude sessions, future agents, the user. Single source of truth for the `echo` project.

---

## 1. Overview

`echo` — codename for an infinite dungeon crawler built on `@f0rbit/forge`. The repo is a **bun workspaces monorepo** containing seven small playable demos plus the composed final game. Each demo is a deliberate stress test against a different forge subsystem; the demos drive forge improvements, then their proven patterns compose into `main`.

The core conceit:

- **Build small, demoable, deployable subsystems first.** A working dungeon-walker in two weeks is more valuable than a half-built full game in two months.
- **Each demo is its own bun-workspace package**, ~300–700 LOC, with a replay-as-test fixture and a static deploy under `f0rbit.github.io/echo/subsystems/<name>/`.
- **One repo, not seven.** No repo spam. Shared CI, shared lockfile, shared lint config. The hub landing at `/echo/` lists every demo and links to the composed game.
- **Forge is the canary.** Every subsystem pressure-tests a different aspect of the engine surface. When two subsystems need the same helper, it gets promoted to forge. When a demo finds a missing primitive, forge ships a new minor.

### Design philosophy (5 bullets)

- **Demos before composition.** No `main` work until subsystems 1–7 are green. Each demo proves an isolated capability of the forge → game integration before we layer game-systemic complexity on top.
- **Replay-as-test is the gate.** A demo isn't done until it has a recorded replay fixture that asserts a non-trivial end state under `bun test`. Visual smoke is post-deploy and manual.
- **Independent forks of one engine.** Subsystems consume `@f0rbit/forge` from npm — never via workspace symlink. They may sit on different forge minors during development; the integration phase (`main`) bumps every subsystem to a single pinned forge version before composition.
- **No shared utility package.** Demos copy code rather than depend on a `subsystems/_shared/`. Duplication is the signal that something belongs in forge. If three demos copy the same pathfinding helper, A* moves to forge — not to a sidecar.
- **Placeholder art is a feature.** Coloured squares + the `__default__` atlas are correct for v1. Real art lands post-`main`.

---

## 2. Game design (concise)

### Pitch

`echo` is a **roguelite infinite dungeon crawler**. You descend through procedurally generated floors, fighting enemies that scale with depth. Every fifth floor is a boss. After clearing a target depth (or any time you choose to bail), you must **ascend back to the top through the floors you already cleared** — but enemies have respawned, harder. Death on either leg ends the run permanently. Between runs, the **hub** persists — NPCs, dialogue, a graveyard listing every dead run, meta-progression for the next attempt.

### Core loop

```
hub → descend → fight → loot → level up → boss → continue or ascend → hub
                  ↑                                                      │
                  └────── run ends, persistent unlocks bank ─────────────┘
```

### Pillars

| # | Pillar |
|---|---|
| P1 | **Permadeath per run, persistence between runs.** Hub state survives. Equipped loot does not. |
| P2 | **Ascent makes depth matter.** Going deep without leaving means a longer climb back. The risk-reward is the meta-game tension. |
| P3 | **Procedural floors, hand-tuned scaling.** Layout is RNG-seeded; difficulty curves are designer-tuned per depth band. |
| P4 | **Boss every 5 floors.** A scripted choreography fight, not a stat-sponge. Wins unlock hub content. |
| P5 | **Tactile combat.** Hits feel meaty: hitstop, particles, camera shake, screen flash. (Subsystem 3.) |
| P6 | **Run graveyard.** Every dead run is a tombstone in the hub. Past selves are content. |

### Out-of-scope for v1 demos (deferred to `main` or post)

- Audio (no demo has it; `main` may add a forge audio subpath later)
- Real art (placeholder coloured squares + `__default__` atlas throughout)
- Saved runs mid-floor (run state persists per-floor; in-floor death = run ends; quitting mid-floor = run ends)
- Multiplayer
- Difficulty modifiers / NG+

---

## 3. Repo layout

### Tree

```
~/dev/echo/                                  bun workspaces monorepo
├── package.json                             root: workspaces = ["subsystems/*", "main"]
├── bun.lock                                 single lockfile, root only
├── tsconfig.json                            root: paths, strict
├── biome.json                               shared lint config
├── README.md
├── AGENTS.md                                project conventions, imports global ~/.claude/AGENTS.md
├── CLAUDE.md                                one-liner: @AGENTS.md
├── LICENSE
├── .gitignore                               node_modules, dist, _site, .DS_Store
├── .github/
│   └── workflows/
│       └── pages.yml                        single workflow: build all → aggregate → deploy
├── hub/                                     landing site (Astro)
│   ├── package.json
│   ├── astro.config.mjs
│   ├── src/
│   │   ├── pages/index.astro                lists all demos with screenshots + play links
│   │   └── content/                         per-demo blurb (mdx)
│   └── public/
└── subsystems/
│   ├── dungeon-walk/
│   │   ├── package.json                     deps: @f0rbit/forge, pixi.js, @f0rbit/corpus, zod
│   │   ├── tsconfig.json                    extends ../../tsconfig.json
│   │   ├── index.html                       <script src="./dist/main.js">
│   │   ├── src/
│   │   │   ├── main.ts                      browser entry, calls boot()
│   │   │   ├── plugin.ts                    game_plugin(world, schedule)
│   │   │   ├── components.ts
│   │   │   ├── resources.ts
│   │   │   ├── level.ts                     map gen / setup
│   │   │   └── systems/
│   │   ├── test/
│   │   │   ├── plugin.test.ts               headless plugin smoke
│   │   │   └── replay.test.ts               replay-as-test deliverable
│   │   ├── tools/
│   │   │   └── record-walk.ts               re-records the replay fixture
│   │   └── replays/
│   │       └── walk.replay.json
│   ├── bestiary/                            same shape
│   ├── arena/
│   ├── loot/
│   ├── progress/
│   ├── boss/
│   └── hub/                                 NB: subsystem 7 — distinct from /hub landing site
└── main/                                    composed game (Phase 8)
    ├── package.json
    ├── src/
    └── ...
```

### Naming clash — `hub`

Two things called "hub":
- `/hub/` — the **landing site** for `f0rbit.github.io/echo/`. Astro. Lists every demo. Built and deployed alongside subsystems.
- `/subsystems/hub/` — **subsystem 7**, the in-game NPC/dialogue/run-graveyard demo. A bun-bundled game like the other six.

If this clash becomes a real problem in conversation, rename the landing site to `/site/` later. For v1 the directory paths are unambiguous and the names match user intent.

### Root `package.json`

```jsonc
{
  "name": "echo",
  "private": true,
  "type": "module",
  "workspaces": ["subsystems/*", "hub", "main"],
  "scripts": {
    "test": "bun test",
    "typecheck": "bun --filter '*' typecheck",
    "build": "bun --filter '*' build",
    "lint": "biome check .",
    "lint:fix": "biome check --fix ."
  },
  "devDependencies": {
    "@biomejs/biome": "^1",
    "@types/bun": "^1.3.0",
    "typescript": "^5.6.0"
  }
}
```

`bun --filter '*' <script>` runs the named script in every workspace that defines it. (Bun ≥ 1.1; verify against installed version in Phase 0.) `bun test` from the root walks every workspace's `test/` automatically — no per-workspace runner config needed.

### Per-subsystem `package.json` (canonical shape)

Modelled on `coin-collector/package.json`. Every subsystem's package.json is identical except for `name` and any subsystem-specific dev-only tools.

```jsonc
{
  "name": "@echo/dungeon-walk",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "src/main.ts",
  "scripts": {
    "dev":       "bun build src/main.ts --outdir dist --watch --target browser",
    "build":     "bun build src/main.ts --outdir dist --target browser --minify",
    "test":      "bun test",
    "typecheck": "tsc --noEmit",
    "record":    "bun run tools/record-walk.ts"
  },
  "dependencies": {
    "@f0rbit/corpus": "^0.3.5",
    "@f0rbit/forge":  "^0.2.0",
    "pixi.js":        "^8",
    "zod":            "^3.25.0"
  },
  "devDependencies": {
    "@types/bun": "^1.3.0",
    "typescript": "^5.6.0"
  }
}
```

### Workspace dependency policy

- **Each subsystem depends on `@f0rbit/forge` from npm** — never on `@echo/*` siblings, never on a shared lib. Subsystems are independent demos.
- **Different subsystems may sit on different forge minors during development.** When forge ships v0.3.0 mid-`arena` development, `dungeon-walk` does not bump immediately. Drift is tolerated until Phase 8.
- **Phase 8 alignment.** Before `main` work begins, every subsystem bumps to the latest forge version, retests its replay fixture, and re-records if needed. This is the version-alignment task in Phase 8.
- **No `@echo/shared` or `subsystems/_shared/`.** Code that wants to live there belongs in forge instead. The decision rule: helper used in 2+ subsystems → propose forge promotion; helper used in 1 subsystem → keep game-side until proven.

### Per-subsystem `tsconfig.json`

Extends a root `tsconfig.json` modelled on `coin-collector/tsconfig.json`:

```jsonc
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@dw/*": ["./src/*"] }
  },
  "include": ["src/**/*", "test/**/*", "tools/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

Each subsystem keeps its own short alias (`@dw`, `@bst`, `@ar`, `@lt`, `@pr`, `@bs`, `@hb`) for internal imports. Cross-subsystem imports are forbidden and not wired up by any path mapping.

### Root `tsconfig.json`

Mirror of `coin-collector/tsconfig.json` minus the alias:

```jsonc
{
  "compilerOptions": {
    "target":                          "ES2022",
    "module":                          "ESNext",
    "moduleResolution":                "bundler",
    "lib":                             ["ES2022", "DOM"],
    "strict":                          true,
    "noUncheckedIndexedAccess":        true,
    "noImplicitOverride":              true,
    "noFallthroughCasesInSwitch":      true,
    "allowSyntheticDefaultImports":    true,
    "esModuleInterop":                 true,
    "skipLibCheck":                    true,
    "resolveJsonModule":               true,
    "isolatedModules":                 true,
    "verbatimModuleSyntax":            true,
    "allowImportingTsExtensions":      true,
    "useDefineForClassFields":         true,
    "forceConsistentCasingInFileNames": true,
    "noEmit":                          true,
    "types":                           ["bun-types"]
  }
}
```

---

## 4. Subsystem catalogue

Each subsystem is a complete, deployable mini-game. The seven below are scoped to ~300–700 LOC of game code each (excluding forge surface). Every subsystem has the same package shape (§3); the entries below cover what makes each one different.

### 4.1 `dungeon-walk`

**Goal.** Walk a procedurally generated dungeon floor with FOV-limited vision and tile-based movement. No combat, no enemies (yet). Goal: find the staircase, descend, find the next staircase. Repeat 3 floors.

**Mechanical spec.**
- 320×180 design canvas, 16×11 tile grid (20px tiles).
- Movement: arrow keys / WASD / d-pad → one tile per input edge (just-pressed semantics).
- FOV: shadow-casting from the player, radius 5 tiles. Walls block. Once-seen tiles dimmed but visible.
- Staircase glyph spawns in the farthest room from the player. Stepping on it generates a new floor.
- Win: reach floor 3's staircase. Lose: not possible (no enemies).

**Game-side data.**
- Components: `tile_c { kind: "floor" | "wall" | "stair" }`, `seen_c true`, `visible_c true`, `player_c true`.
- Resources: `floor_r { depth: number, seed: number }`, `dungeon_r { width, height, tiles: Cell[] }`.

**Forge stress.**
- Grid helpers: cell↔world coordinate conversion, neighbour lookup, random-empty-cell selection. Surfaces `forge.grid` proposal.
- Large entity counts (one entity per visible tile? — or store tiles in a resource? — see DECISION-1 below). Stress tests sparse-set ECS at ~200 entities/floor.
- Seeded RNG layouts: same seed = same dungeon. Validates `rng.fork()` per-floor.

**Forge bump expected.** **v0.2.0** alongside this subsystem. Lands `forge.grid` (cell↔world, neighbours, random_empty) and `schedule.add_periodic(stage, system, every: ticks)` for the periodic FOV recompute.

**DECISION-1 — tiles as entities or as a resource?** ECS-purist answer: every tile is an entity. Practical answer: a flat `Cell[]` in a `dungeon_r` resource is faster, simpler, and the entity-per-tile pattern doesn't pay for itself until tiles have per-entity behaviour. **Recommendation: tiles in a resource; only walls/staircases that need rendering get entities.** Mark this for review in Phase 1.

**Replay test.** `replays/walk.replay.json` — recorded action stream that walks from spawn to stair on floor 1 to stair on floor 3 with seed `42`. Asserts `floor_r.depth === 3` and player position matches the floor-3 stair tile after replay.

**LOC.** ~600 (gen ~200, FOV ~120, render/tile-sprites ~150, input/movement ~80, replay test ~50).

**Dependencies.** None.

---

### 4.2 `bestiary`

**Goal.** A single floor populated with five enemy archetypes. The player walks the same dungeon as 4.1; enemies pursue, patrol, or shoot based on archetype. Goal: survive 60 seconds.

**Mechanical spec.**
- Same grid + FOV + movement as 4.1. Player has no attack — pure dodge demo.
- Archetypes (one entity each, plus a couple of duplicates):
  - **Chaser** — A* pathfind toward player when in line-of-sight; otherwise idle.
  - **Patroller** — fixed loop between two waypoints; aggros if player enters 3-tile aggro radius.
  - **Ranged** — stays put; fires a projectile every 2s if line-of-sight to player.
  - **Summoner** — every 5s, spawns a chaser at a random adjacent cell.
  - **Idle** — does nothing; placeholder for the schema.
- Touch by any enemy or projectile = lose.
- Survive 60s = win.

**Game-side data.**
- Components: `enemy_c { archetype: "chaser" | "patroller" | "ranged" | "summoner" | "idle", state, target?, cooldown? }`, `projectile_c { vx, vy, ttl }`, `aggro_c true`.
- Resources: `combat_r { player_alive, elapsed_s }`.

**Forge stress.**
- Per-archetype state machines. Surfaces a candidate `phase_r` finite-state-machine helper for forge. Hold game-side until 2+ subsystems need it (loot inventory state, boss phases — likely promoted at boss).
- `schedule.add_periodic` (validated by 4.1, exercised heavily here for summon timers, projectile cooldowns).
- A* pathfinding: chaser archetype runs A* over the grid every N ticks. Surfaces an `astar(grid, start, end)` helper.
- FOV/aggro queries (line-of-sight checks).

**Forge bump expected.** Patches as needed (v0.2.x). A* is held game-side initially — promoted to forge in Phase 8 only if `boss` or `arena` re-implements it.

**Replay test.** `replays/dodge-60s.replay.json` — recorded action stream surviving 60 seconds against seed `7` enemy layout. Asserts `combat_r.player_alive === true` and `time.elapsed >= 60` after replay.

**LOC.** ~700 (per-archetype AI ~250, A* ~150, projectiles ~80, replay test ~80, level setup ~80, sprite/render glue ~60).

**Dependencies.** Reuses dungeon gen patterns from 4.1 — copies the code, doesn't import.

---

### 4.3 `arena`

**Goal.** A 320×180 single-room arena with the player + a punching bag dummy + waves of weak chasers. Goal: feel good. The whole subsystem exists to get hit feedback right.

**Mechanical spec.**
- One room, no FOV, no walls except the boundary.
- Player has a melee swing (Z) and a ranged shot (X). Melee = 90° arc in front, instant. Ranged = projectile, 4-tile speed.
- Hits trigger: hitstop (4 frames of `time.scale = 0`), camera shake (decaying), particle burst at hit point, sprite flash on the receiver, screen flash on melee.
- Three waves of 5 chasers each. Win = clear all waves. Lose = take 3 hits.

**Game-side data.**
- Components: `weapon_c { kind, cooldown }`, `health_c { current, max }`, `flash_c { ttl, color }`.
- Resources: `camera_shake_r { magnitude, decay }`, `particles_r { entries: ParticleEntry[] }` (a ring buffer, not entities), `hitstop_r { remaining_ticks }`, `wave_r { current, kills_in_wave, total_kills }`.

**Forge stress.**
- **Particle/effect world-space buffer.** Particles as entities are wasteful; a flat ring buffer in a resource scales. Surfaces a candidate `forge.fx` particles primitive. Promote to forge if `boss` reuses it (likely yes).
- **Event queues.** Hit events flow through a per-tick buffer (cleared each schedule tick) — same shape as forge's existing `anim_events` resource. Reuses that pattern.
- **`anim_c`** for sprite flash, swing animation, projectile trail.
- **`time.scale = 0` for hitstop** — surfaces any latent assumption that `fixed_dt` is always positive in forge systems.
- **Camera shake.** May surface a `camera.set_offset(x, y)` API if pixi camera doesn't already expose one.

**Forge bump expected.** **v0.3.0** alongside this subsystem. Particles primitive (`forge.fx` or buffered into existing render pipeline). Camera-shake offset on `forge.pixi.camera`. Possibly a `time.scale_for(ticks: n, scale: 0)` helper.

**Replay test.** `replays/wave-clear.replay.json` — clears all 3 waves with seed `1`. Asserts `wave_r.total_kills === 15` and `health_r > 0`. Asserts the particle buffer has at least one entry on the tick of each kill (drained from `particles_r` mid-replay, since the buffer clears post-render).

**LOC.** ~650 (combat 200, particles 150, hitstop+shake+flash 100, sprites/anim 80, replay test 60, level 60).

**Dependencies.** None.

---

### 4.4 `loot`

**Goal.** Pick up items, equip them, see stat modifiers compose. The "RPG inventory" demo.

**Mechanical spec.**
- Same single-room arena from 4.3 minus enemies. Pickups (potions, rings, swords) scattered around.
- Walk over a pickup → it goes into inventory (max 12 slots, grid UI overlay).
- Press `I` → toggle inventory overlay. Click slot → equip / use. Equipment slots: weapon, offhand, ring (×2).
- Equipped items apply stat modifiers (`+5 atk`, `+10% spd`, etc.). Modifiers compose multiplicatively where appropriate, additively otherwise.
- Player has a stat panel (top-right HUD) showing current effective stats.

**Game-side data.**
- Components: `pickup_c { item_id }`, `inventory_c { slots: (Item | null)[] }`, `equipment_c { weapon, offhand, ring1, ring2 }`, `stats_c { atk, def, spd, hp }`.
- Resources: `item_registry_r { items: Map<id, ItemDef> }`, `inventory_ui_r { open, selected }`.

**Forge stress.**
- **UI overlays** layered over the game world. Surfaces the question of whether forge should ship a `/ui` subpath (panels, lists, simple layout). **Recommendation: do NOT promote to forge yet** — this subsystem ships a Pixi-Container-based inventory grid as game-side code; only if `progress` (perks UI), `hub` (NPC dialogue UI), and `boss` (boss-health UI) all re-implement it does `/ui` get its own forge subpath. That decision lives in Phase 8.
- **Snapshot serialization.** Inventory state must round-trip through `snap`/`restore`. Surfaces missing Zod schemas for game components and validates the snapshot extension model.
- **Modifier composition.** Adding/removing equipment recomputes `stats_c.atk` etc. Pure data; no forge implication.

**Forge bump expected.** Patches only (v0.3.x). The `/ui` subpath gate is tripped by the third UI-owning subsystem, not by this one alone.

**Replay test.** `replays/equip-and-stat.replay.json` — picks up 3 items, equips a sword and ring, asserts `stats_c.atk === expected_post_equip_value`. Also tests snapshot round-trip: `snap()` mid-replay → `restore()` → continue replay → final state identical.

**LOC.** ~600 (inventory UI 200, items + modifiers 150, equipment system 100, snapshot test 60, level 50, replay test 40).

**Dependencies.** Reuses pickup pattern from `coin-collector` reference. No subsystem deps.

---

### 4.5 `progress`

**Goal.** XP, levelling, perks, run save/load. The "meta-progression" demo.

**Mechanical spec.**
- Same arena from 4.3 with weak chasers. Killing enemies grants XP.
- XP threshold per level scales (`100 * level`). On level-up: pause game, show 3 random perks, player picks one. Perks apply permanent stat modifiers + occasionally new abilities (e.g., "double swing").
- Save current run state (XP, level, perks, position, alive) to disk via `engine_store.snapshots`. Reload restores everything.
- Palette command `/save slot-1`, `/load slot-1`. Auto-save every 30s.

**Game-side data.**
- Components: `xp_c { current, level }`, `perks_c { applied: PerkId[] }`.
- Resources: `perk_registry_r`, `level_up_pending_r { choices: Perk[] }`, `save_meta_r { last_save_tick }`.

**Forge stress.**
- **`engine_store.snapshots` end-to-end.** This is the demo that proves the save/load chain works for a real game state — not just the engine's own bindings/prefs.
- **Palette commands.** Game registers `/perk-list`, `/grant-xp 100`, `/save`, `/load` — the dev console for debugging runs. Validates `palette.register` from game code.
- **Pause-on-level-up** via `time.scale = 0` (already exercised by 4.3, validated again here).

**Forge bump expected.** None expected. This subsystem is pure validation of the existing snapshot/storage/palette surfaces. If anything surfaces, it's a snapshot-schema-registry usability bug — patch only.

**Replay test.** `replays/level-up-and-save.replay.json` — kills enemies until level 3, picks 3 perks, `/save slot-1`, asserts `xp_c.level === 3`. Then a separate test loads the slot in a fresh harness and asserts identical state.

**LOC.** ~550 (XP+levelling 100, perks system 150, save/load wiring 100, palette commands 60, level 50, replay test 90).

**Dependencies.** None.

---

### 4.6 `boss`

**Goal.** A scripted, multi-phase boss fight. The "set piece" demo.

**Mechanical spec.**
- Single arena room. Player starts in centre, boss enters from the top.
- Boss has 3 phases, each ~10s:
  - **Phase 1 — telegraph slam.** Boss telegraphs slam regions (red rectangles) for 1.5s, then slams; if player overlaps slam region at slam-tick, big damage. Repeats every 3s.
  - **Phase 2 — projectile spiral.** Boss stays still, fires projectiles in a rotating spiral pattern.
  - **Phase 3 — chase + adds.** Boss chases player; spawns adds (chasers from `bestiary`) every 4s.
- Phase transitions trigger on HP thresholds (66%, 33%, dead).
- Win = boss dead. Lose = player dead.

**Game-side data.**
- Components: `boss_c { phase, hp, max_hp }`, `telegraph_c { region, fire_at_tick, kind }`, `add_c true`.
- Resources: `boss_phase_r { current, since_tick, scripted_steps: ScriptStep[] }`, `script_cursor_r { step_idx, wait_until_tick }`.

**Forge stress.**
- **Scripted-sequence DSL.** A boss is a sequence of "wait N ticks, do X, wait until condition, branch on HP". Hand-rolled in this subsystem first; promoted to forge once the shape is clear.
- **Replay-as-test for the fight.** A scripted, deterministic boss is the perfect replay candidate. The fixture asserts a specific kill-by-tick number with a specific input sequence. This is the most demanding replay-determinism test in the project.
- **Particles + camera shake** (already in forge from 4.3) — heavy use.

**Forge bump expected.** **v0.4.0** alongside this subsystem. Lands `forge.script` (or whatever the chosen name is) — a tiny scripted-sequence DSL that boss code authors fight choreography against. The DSL is forge-side because subsystem 7 (`hub`) wants the same pattern for cutscenes/dialogue triggers.

**Replay test.** `replays/boss-kill.replay.json` — scripted player input that kills the boss with seed `99` at a specific tick. The deterministic property of the boss is the load-bearing assertion: same seed + same input = boss dies at exactly the same tick, every run.

**LOC.** ~700 (boss state machine 200, scripted-sequence harness 200, telegraph + projectiles 150, replay test 100, level 50).

**Dependencies.** Reuses chaser AI pattern from `bestiary` (copies, doesn't import). Reuses particles/shake from `arena`'s forge contributions.

---

### 4.7 `hub`

**Goal.** A persistent home base. NPCs you can talk to, dialogue trees, a graveyard listing previous runs. The "between-run" demo.

**Mechanical spec.**
- Small room (no FOV, no combat). Three NPCs, each with a multi-branch dialogue tree.
- Press `E` near an NPC → opens dialogue panel. Choices presented as keyboard 1/2/3.
- Some dialogue branches set persistent flags (`hub_state.met_smith = true`); flags persist across "runs".
- A graveyard wall: each tombstone is a previous dead run, showing depth reached + cause of death. Sourced from a persistent `runs[]` list in the hub state.
- A "start run" portal — clicking it would launch the game proper. In this subsystem, clicking it just appends a fake run record (depth 1–10 random, cause from a list) to the graveyard and refreshes the wall.

**Game-side data.**
- Components: `npc_c { id, current_node }`, `tombstone_c { run_id }`, `interactable_c { range }`.
- Resources: `dialogue_r { active_npc?, current_node?, history }`, `hub_state_r { met_smith, met_seer, runs: RunRecord[] }`.

**Forge stress.**
- **Text rendering.** A real dialogue panel needs measurable text, line wrapping, advance-by-line. Surfaces forge gaps in `palette-pixi` text utilities — may promote shared text helpers.
- **Branching state.** Dialogue trees as data (JSON or TS literals). Pure game-side. Validates that no forge primitive is needed for tree traversal.
- **Cross-run persistence.** `hub_state_r` is saved every dialogue interaction and on portal-click. Validates `engine_store.snapshots` lifetime semantics from a different angle than `progress` — many small writes vs few big ones.

**Forge bump expected.** Patches only (v0.4.x). May surface a `forge.text` helper (measure, wrap, layout) if subsequent demos pile on; held game-side for v1.

**Replay test.** `replays/dialogue-and-run-record.replay.json` — talks to all three NPCs, chooses specific branches, clicks the portal three times, asserts `hub_state_r.runs.length === 3` and `hub_state_r.met_smith === true`. Tests cross-replay persistence via snapshot save/load between sub-runs of the same replay.

**LOC.** ~600 (dialogue engine 150, NPC interaction 100, graveyard wall 80, hub-state save 80, level 80, replay test 110).

**Dependencies.** None among subsystems. Reuses `progress`'s save/load patterns (copies).

---

### `main` — composed game (Phase 8, not a subsystem entry)

Combines:
- Dungeon gen + FOV from `dungeon-walk`
- Enemy AI from `bestiary`
- Combat feel from `arena`
- Inventory + equipment from `loot`
- XP + levelling + perks from `progress`
- Boss every 5 floors from `boss`
- Hub between runs from `hub`

LOC estimate: ~1500–2000, mostly composition glue. Most logic comes pre-proven from subsystems.

---

## 5. Forge improvement gates

Forge improvements ship through forge's existing `publish.yml` OIDC flow — **not echo's CI**. Echo just bumps the consumed `@f0rbit/forge` version per subsystem when a new minor lands.

### Promotion criteria

A pattern moves from echo into forge when:

| Trigger | Outcome |
|---|---|
| Used in **2+ subsystems** | Promote to forge as a new function/helper. |
| Used in **1 subsystem** but clearly engine-shaped (e.g., grid math, FSMs) | Hold game-side until a second subsystem confirms the shape. Reassess at Phase 8. |
| Used in **3+ subsystems** with UI shape | Justify a new forge subpath (`/ui`, `/text`, `/fx`, etc.). |
| Surface bug or missing primitive in forge | Patch release; echo subsystem bumps and re-records replay if needed. |

### Forge bump table (per phase)

| Phase | Subsystem | Expected forge bump | Lands |
|---|---|---|---|
| Phase 1 | `dungeon-walk` | **v0.2.0** | `forge.grid` (cell↔world, neighbours, random_empty); `schedule.add_periodic` |
| Phase 2 | `bestiary` | v0.2.x patches | A* held game-side (promote in Phase 8 if reused) |
| Phase 3 | `arena` | **v0.3.0** | Particle/effect world-space buffer; camera-shake API; possibly `time.scale_for(ticks, scale)` |
| Phase 4 | `loot` | v0.3.x patches | UI subpath gate not tripped (held game-side) |
| Phase 5 | `progress` | None expected | Pure validation of existing snapshot/storage/palette |
| Phase 6 | `boss` | **v0.4.0** | `forge.script` scripted-sequence DSL; possibly FSM helper `phase_r` |
| Phase 7 | `hub` | v0.4.x patches | Possibly `forge.text` (held until Phase 8 review) |
| Phase 8 | `main` | **v0.5.0** (rollup) | Whatever Phase 8 review promotes — A*, `phase_r`, `/ui`, `/text` candidates evaluated together |

### Subsystem version drift

Subsystems may sit on different forge minors during their own phase:

```
phase 1 done: dungeon-walk on @f0rbit/forge ^0.2.0
phase 2 done: bestiary on ^0.2.x;  dungeon-walk still on ^0.2.0  (compatible)
phase 3 done: arena on ^0.3.0;     bestiary on ^0.2.x;  dungeon-walk on ^0.2.0  (compatible)
...
phase 8 start: align ALL to latest forge minor; re-run every replay test; re-record any that drift.
```

This is intentional — forcing a global bump after every forge change would burn a lot of replay re-recording for no benefit during demo development. Phase 8 absorbs the cost in one batch.

---

## 6. Build / CI / deploy infrastructure

### Goal

A single `pages.yml` workflow that, on push to `main`:
1. Installs dependencies (root install).
2. Typechecks all workspaces.
3. Runs `bun test` (which walks all workspaces).
4. Builds each subsystem to `subsystems/<name>/dist/main.js`.
5. Builds the `/hub` Astro site to `hub/dist/`.
6. Aggregates everything into `_site/` matching the deployed URL structure.
7. Uploads `_site/` to GitHub Pages.

### Deploy URL structure

```
https://f0rbit.github.io/echo/                                     hub landing (from /hub Astro build)
https://f0rbit.github.io/echo/subsystems/dungeon-walk/             dungeon-walk demo (from /subsystems/dungeon-walk/dist/ + index.html)
https://f0rbit.github.io/echo/subsystems/bestiary/
https://f0rbit.github.io/echo/subsystems/arena/
https://f0rbit.github.io/echo/subsystems/loot/
https://f0rbit.github.io/echo/subsystems/progress/
https://f0rbit.github.io/echo/subsystems/boss/
https://f0rbit.github.io/echo/subsystems/hub/                      subsystem 7 (NB: distinct from the landing /echo/)
https://f0rbit.github.io/echo/main/                                composed game (Phase 8)
```

### `_site/` aggregation

```
_site/
├── index.html                                  hub/dist/index.html  (Astro static output)
├── assets/                                     hub/dist/assets/
├── _astro/                                     hub/dist/_astro/
├── subsystems/
│   ├── dungeon-walk/
│   │   ├── index.html                          subsystems/dungeon-walk/index.html
│   │   └── dist/main.js                        subsystems/dungeon-walk/dist/main.js
│   ├── bestiary/
│   │   ├── index.html
│   │   └── dist/main.js
│   ├── arena/   ...   loot/   ...   progress/   ...   boss/   ...   hub/   ...
└── main/
    ├── index.html
    └── dist/main.js
```

### Subsystem `index.html` (canonical shape)

Modelled on `coin-collector/index.html`. Each subsystem ships its own minimal HTML that script-loads its bundle:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>echo · dungeon-walk</title>
    <style>
      html, body { margin: 0; height: 100%; background: #0a0a10; color: #ddd; font-family: monospace; overflow: hidden; }
      #root { width: 100vw; height: 100vh; }
      #root canvas { display: block; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./dist/main.js"></script>
  </body>
</html>
```

The relative `./dist/main.js` works both locally (run a static server in `subsystems/dungeon-walk/`) and on GH Pages (the deploy stages `subsystems/dungeon-walk/{index.html, dist/main.js}` together at `/echo/subsystems/dungeon-walk/`).

### Base-path handling

`bun build --target browser` does **not** require an explicit base path for relative-script-tag bundles. The `index.html` references `./dist/main.js` relative to itself, and the bundle's runtime imports (none, in our case — Pixi is bundled in) don't depend on the absolute deploy path. **No per-subsystem `assetsBase` configuration is needed.**

The Astro `/hub` landing site does need `site` and `base`:

```js
// hub/astro.config.mjs
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://f0rbit.github.io",
  base: "/echo/",
});
```

### `.github/workflows/pages.yml`

Modelled on `coin-collector/.github/workflows/pages.yml` (single-bundle deploy) extended to aggregate multiple bundles. **Sequential build of subsystems** for v1 (matrix is deferred — see Risks §9):

```yaml
name: pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: latest }

      - name: Install
        run: bun install --frozen-lockfile

      - name: Typecheck
        run: bun --filter '*' typecheck

      - name: Test
        run: bun test

      - name: Build subsystems
        run: bun --filter './subsystems/*' build

      - name: Build hub landing
        run: bun --filter './hub' build

      - name: Stage site
        run: |
          mkdir -p _site
          cp -r hub/dist/. _site/
          mkdir -p _site/subsystems
          for sub in subsystems/*/; do
            name=$(basename "$sub")
            mkdir -p "_site/subsystems/$name/dist"
            cp "$sub/index.html" "_site/subsystems/$name/index.html"
            cp -r "$sub/dist/." "_site/subsystems/$name/dist/"
          done
          # main/ included once Phase 8 lands; until then this block is a no-op or skipped
          if [ -d main/dist ]; then
            mkdir -p _site/main/dist
            cp main/index.html _site/main/index.html
            cp -r main/dist/. _site/main/dist/
          fi

      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: _site }

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

### Local dev

For each subsystem, the `dev` script (`bun build --watch`) writes to `dist/`; the developer runs a static server in `subsystems/<name>/` and opens the `index.html`. No subsystem build is needed to develop — `bun test` alone exercises the headless logic via the replay fixture.

---

## 7. Phased build plan

Sized so each phase is "one focused day or two." LOC estimates include tests. Each phase ends with a green replay test, a typecheck-clean build, a successful pages deploy, and an atomic commit. **No phase starts until the previous phase's verification + commit passes.**

### Phase 0 — repo scaffold (sequential)

| Task | LOC | Touches |
|---|---|---|
| `mkdir ~/dev/echo`; `bun init` at root; root `package.json` with workspaces, scripts, devDeps | ~40 | root |
| Root `tsconfig.json` (mirror of `coin-collector/tsconfig.json`, no alias) | ~30 | root |
| Root `biome.json` (shared lint config) | ~30 | root |
| `.gitignore` (`node_modules/`, `dist/`, `_site/`, `.DS_Store`, `*.log`) | ~10 | root |
| `LICENSE` (user picks; default MIT) | ~20 | root |
| `README.md` — link to plan, list subsystems, dev quick-start | ~50 | root |
| `AGENTS.md` (project conventions, imports `~/.claude/AGENTS.md`) | ~80 | root |
| `CLAUDE.md` — `@AGENTS.md` one-liner | ~1 | root |
| `.github/workflows/pages.yml` — single workflow, sequential builds, aggregated `_site/` | ~70 | .github/ |
| `/hub` Astro skeleton: `package.json`, `astro.config.mjs`, `src/pages/index.astro` placeholder ("subsystems coming soon") | ~80 | hub/ |
| Subsystem placeholder dirs (empty for now): `subsystems/{dungeon-walk,bestiary,arena,loot,progress,boss,hub}/` | ~0 | subsystems/* |
| Verify `bun install` from root resolves; `bun --filter '*' typecheck` no-ops cleanly; pages workflow lints | ~0 | (verification) |

**Deliverable.** Repo exists with passing CI on a placeholder hub. `f0rbit.github.io/echo/` shows "subsystems coming soon".
**Parallelisable.** No — single coder, sequential. Scaffold is load-bearing.
**LOC total.** ~410.

### Phase 1 — `dungeon-walk` (parallelisable inside)

| Task | LOC | Parallel? | Files |
|---|---|---|---|
| `subsystems/dungeon-walk/package.json` + `tsconfig.json` + `index.html` | ~50 | sequential head | subsystems/dungeon-walk/ |
| `src/components.ts` + `src/resources.ts` (game data shapes) | ~80 | A | subsystems/dungeon-walk/src/ |
| `src/level.ts` — dungeon gen, room placement, staircase placement | ~200 | B (after head) | subsystems/dungeon-walk/src/level.ts |
| `src/systems/movement.ts` + `src/systems/fov.ts` (shadow-cast FOV) | ~180 | C (after head) | subsystems/dungeon-walk/src/systems/ |
| `src/plugin.ts` + `src/main.ts` (boot wiring, sprite-tile mapping) | ~120 | D (after A/B/C) | subsystems/dungeon-walk/src/ |
| `tools/record-walk.ts` + `replays/walk.replay.json` | ~80 | follow-on | tools/, replays/ |
| `test/plugin.test.ts` + `test/replay.test.ts` | ~100 | follow-on | test/ |
| **Forge improvements (separate forge repo, parallel work):** `forge.grid` + `schedule.add_periodic` → ship forge v0.2.0 | ~150 (forge) | parallel-forge | (forge repo) |

**Deliverable.** Walk through 3 procedurally generated floors. `bun test` green. `f0rbit.github.io/echo/subsystems/dungeon-walk/` deploys and is playable.
**Forge bump.** v0.2.0.
**LOC total.** ~810 (echo side; ~150 forge side).

### Phase 2 — `bestiary` (parallelisable inside)

| Task | LOC | Parallel? | Files |
|---|---|---|---|
| Subsystem scaffold (`package.json`, `tsconfig.json`, `index.html`) | ~50 | sequential head | subsystems/bestiary/ |
| `level.ts` + dungeon gen reuse (copy from dungeon-walk) | ~150 | A | subsystems/bestiary/src/level.ts |
| `systems/ai-chaser.ts` (A* pathfinding + chase logic) | ~180 | B | subsystems/bestiary/src/systems/ |
| `systems/ai-patroller.ts` + `systems/ai-ranged.ts` + `systems/ai-summoner.ts` | ~200 | C (parallel within itself) | subsystems/bestiary/src/systems/ |
| `systems/projectiles.ts` | ~80 | D | subsystems/bestiary/src/systems/ |
| `plugin.ts` + `main.ts` | ~100 | E (after A/B/C/D) | subsystems/bestiary/src/ |
| Replay fixture + tests | ~120 | follow-on | tools/, replays/, test/ |
| **Forge improvements:** patches as needed (FSM helper held game-side) | ~30 (forge) | parallel-forge | (forge repo) |

**Deliverable.** Survive 60s on the bestiary floor. Replay test green. Deploy live.
**Forge bump.** v0.2.x patch only.
**LOC total.** ~880 (echo side).

### Phase 3 — `arena` (parallelisable inside)

| Task | LOC | Parallel? | Files |
|---|---|---|---|
| Subsystem scaffold | ~50 | sequential head | subsystems/arena/ |
| `systems/combat.ts` (melee + ranged, hit detection) | ~200 | A | subsystems/arena/src/systems/ |
| `systems/feedback.ts` (hitstop, camera shake, sprite flash) | ~150 | B | subsystems/arena/src/systems/ |
| `systems/particles.ts` (ring-buffer particle emitter / drainer) | ~150 | C | subsystems/arena/src/systems/ |
| `systems/waves.ts` (wave spawning + win/lose tracking) | ~80 | D | subsystems/arena/src/systems/ |
| `plugin.ts` + `main.ts` | ~80 | E (after A/B/C/D) | subsystems/arena/src/ |
| Replay fixture + tests | ~100 | follow-on | tools/, replays/, test/ |
| **Forge improvements:** `forge.fx` particle buffer + camera-shake offset → ship forge v0.3.0 | ~250 (forge) | parallel-forge | (forge repo) |

**Deliverable.** Wave-clear arena, juicy hit feedback, replay-deterministic kill count. Deploy live.
**Forge bump.** v0.3.0.
**LOC total.** ~810 (echo side; ~250 forge side).

### Phase 4 — `loot` (parallelisable inside)

| Task | LOC | Parallel? | Files |
|---|---|---|---|
| Subsystem scaffold | ~50 | sequential head | subsystems/loot/ |
| `systems/inventory.ts` (state, slot management) | ~150 | A | subsystems/loot/src/systems/ |
| `systems/equipment.ts` (slot equip/unequip, modifier recompute) | ~120 | B | subsystems/loot/src/systems/ |
| `systems/inventory-ui.ts` (Pixi container overlay, click-to-equip) | ~200 | C | subsystems/loot/src/systems/ |
| `systems/pickups.ts` (walk-over collection) | ~60 | D | subsystems/loot/src/systems/ |
| `data/items.ts` — item registry + 12 sample items | ~120 | E (parallel) | subsystems/loot/src/data/ |
| `plugin.ts` + `main.ts` | ~70 | F (after A–E) | subsystems/loot/src/ |
| Replay fixture (incl. snapshot round-trip mid-replay) + tests | ~120 | follow-on | tools/, replays/, test/ |

**Deliverable.** Equip items, see stats change, snapshot survives a round-trip. Deploy live.
**Forge bump.** v0.3.x patch only.
**LOC total.** ~890 (echo side).

### Phase 5 — `progress` (parallelisable inside)

| Task | LOC | Parallel? | Files |
|---|---|---|---|
| Subsystem scaffold | ~50 | sequential head | subsystems/progress/ |
| `systems/xp.ts` + `systems/level-up.ts` (XP gain, threshold, pause-and-pick) | ~150 | A | subsystems/progress/src/systems/ |
| `systems/perks.ts` + `data/perks.ts` (registry + apply/revert logic) | ~180 | B | subsystems/progress/src/systems/ |
| `systems/save-load.ts` + palette command registration | ~100 | C | subsystems/progress/src/systems/ |
| `level.ts` (arena reuse) | ~100 | D (parallel) | subsystems/progress/src/ |
| `plugin.ts` + `main.ts` | ~80 | E (after A–D) | subsystems/progress/src/ |
| Replay fixture + load-from-saved-slot test + tests | ~150 | follow-on | tools/, replays/, test/ |

**Deliverable.** Level up to 3, pick perks, save/load round-trips state. Deploy live.
**Forge bump.** None expected.
**LOC total.** ~810 (echo side).

### Phase 6 — `boss` (parallelisable inside)

| Task | LOC | Parallel? | Files |
|---|---|---|---|
| Subsystem scaffold | ~50 | sequential head | subsystems/boss/ |
| `systems/script.ts` (game-side scripted-sequence DSL — promote-candidate) | ~250 | A | subsystems/boss/src/systems/ |
| `systems/boss-state.ts` (3-phase state machine, HP-thresholded transitions) | ~180 | B (uses A) | subsystems/boss/src/systems/ |
| `systems/telegraph.ts` (red-rect telegraph + slam application) | ~120 | C | subsystems/boss/src/systems/ |
| `systems/projectile-spiral.ts` (Phase 2 pattern) | ~80 | D | subsystems/boss/src/systems/ |
| `systems/adds.ts` (Phase 3 add-summoning, reuses chaser AI from bestiary — copy) | ~100 | E | subsystems/boss/src/systems/ |
| `plugin.ts` + `main.ts` | ~80 | F (after A–E) | subsystems/boss/src/ |
| Replay fixture (kill-by-tick determinism) + tests | ~150 | follow-on | tools/, replays/, test/ |
| **Forge improvements:** `forge.script` scripted-sequence DSL + possible FSM helper → ship forge v0.4.0 | ~300 (forge) | parallel-forge | (forge repo) |

**Deliverable.** Boss dies at exactly tick N every replay run. Deploy live.
**Forge bump.** v0.4.0.
**LOC total.** ~1010 (echo side; ~300 forge side).

### Phase 7 — `hub` (parallelisable inside)

| Task | LOC | Parallel? | Files |
|---|---|---|---|
| Subsystem scaffold | ~50 | sequential head | subsystems/hub/ |
| `systems/dialogue.ts` (tree traversal, choice handling) | ~150 | A | subsystems/hub/src/systems/ |
| `systems/dialogue-ui.ts` (Pixi text panel, choice keys) | ~150 | B | subsystems/hub/src/systems/ |
| `systems/npc.ts` (interaction range, prompt rendering) | ~80 | C | subsystems/hub/src/systems/ |
| `systems/graveyard.ts` (tombstone rendering, run records) | ~100 | D | subsystems/hub/src/systems/ |
| `data/npcs.ts` + `data/dialogue-trees.ts` | ~150 | E (parallel) | subsystems/hub/src/data/ |
| `systems/persistence.ts` (cross-run save) | ~80 | F | subsystems/hub/src/systems/ |
| `plugin.ts` + `main.ts` | ~80 | G (after A–F) | subsystems/hub/src/ |
| Replay fixture + tests | ~120 | follow-on | tools/, replays/, test/ |

**Deliverable.** Talk to NPCs, see graveyard fill across portal-clicks, persistence survives reload. Deploy live.
**Forge bump.** v0.4.x patch only.
**LOC total.** ~960 (echo side).

### Phase 8 — `main` composed game (sequential head, parallel body)

| Task | LOC | Parallel? | Files |
|---|---|---|---|
| **Forge alignment.** Bump every subsystem to latest forge minor; re-run every replay test; re-record any that drift | ~50 | sequential head | subsystems/* |
| **Forge promotion review.** Decide: A* (yes/no), `phase_r` (yes/no), `/ui` (yes/no), `/text` (yes/no). Ship forge v0.5.0 with chosen promotions | ~varies | sequential head | (forge repo) |
| `main/package.json` + `tsconfig.json` + `index.html` | ~50 | A | main/ |
| `main/src/dungeon/` — dungeon-walk integration (depth scaling, staircase to next floor) | ~250 | B | main/src/dungeon/ |
| `main/src/combat/` — arena combat + bestiary AI integration | ~300 | C | main/src/combat/ |
| `main/src/loot/` — loot integration (pickups drop from enemies) | ~200 | D | main/src/loot/ |
| `main/src/progress/` — XP+perks integration (XP from kills, level-up between floors) | ~200 | E | main/src/progress/ |
| `main/src/boss/` — boss every 5 floors integration | ~250 | F | main/src/boss/ |
| `main/src/hub/` — hub integration (between-runs persistence, run records on death/win) | ~250 | G | main/src/hub/ |
| `main/src/run.ts` — run lifecycle (descend/ascend, depth scaling, end-of-run flow) | ~200 | H (after B–G) | main/src/run.ts |
| `main/src/main.ts` + `plugin.ts` (composition root) | ~150 | I (after H) | main/src/ |
| Integration replay test (full short run, seed-deterministic) | ~200 | follow-on | main/test/ |

**Deliverable.** A full short run plays end-to-end: hub → descend 3 floors → boss → continue / ascend → die or escape → run record in graveyard. Deploy live at `f0rbit.github.io/echo/main/`.
**Forge bump.** v0.5.0 (rollup of Phase 8 promotions).
**LOC total.** ~1850 + retrospective fixes to earlier subsystems during alignment.
**Success criteria.** Integration replay green. All seven subsystems still pass their original replay (after re-recording for forge bump). Manual visual smoke from `f0rbit.github.io/echo/main/`.

---

## 8. Open questions / decisions needed

### OQ-1: Custom domain or `f0rbit.github.io/echo/`?

**Options:**
- (a) Subpath under `f0rbit.github.io` — matches `forge`, no DNS work, free.
- (b) Custom domain (e.g., `echo.f0rbit.dev`) — cleaner URLs, requires DNS + GH Pages config.

**Recommendation.** (a) for v1. Matches forge's pattern. Custom domain when the project leaves "tech demo" territory.

**DECISION NEEDED:** confirm subpath.

### OQ-2: Subsystem build tool — `bun build` vs Astro vs Vite?

**Options:**
- (a) `bun build --target browser` per-subsystem (mirrors `coin-collector`). Simple, fast, no extra dep.
- (b) Astro per-subsystem. Overkill — Astro shines for content, not for canvas-only games.
- (c) Vite per-subsystem. Heavier than `bun build` for our needs; useful only if HMR-during-canvas-dev becomes important.

**Recommendation.** (a). Matches coin-collector exactly. Use Astro **only** for the `/hub` landing site (where its content collections + MDX are useful for per-demo blurbs).

**DECISION NEEDED:** confirm `bun build` for subsystems, Astro for `/hub` landing.

### OQ-3: Hub landing tech — static HTML vs Astro vs Solid?

**Options:**
- (a) Static HTML — simplest, but maintaining N demo cards by hand is friction.
- (b) Astro — content collections per demo, MDX blurbs, consistent with forge's docs site.
- (c) Solid — overkill for a static index page.

**Recommendation.** (b) Astro. Reuses `@f0rbit/ui` for branding (matches forge docs theming). Each demo has an MDX blurb (`hub/src/content/demos/dungeon-walk.mdx`) with screenshot + play link.

**DECISION NEEDED:** confirm Astro + `@f0rbit/ui`.

### OQ-4: Per-subsystem shared utilities — copy or extract?

**Options:**
- (a) **Copy game-side until it hurts** (recommended). When 2+ subsystems duplicate, propose a forge promotion. Never extract a `subsystems/_shared/` package — promote to forge instead.
- (b) Extract a private `@echo/shared` package. Encourages premature abstraction, weakens forge's promotion signal.

**Recommendation.** (a). Strict no-shared-package policy.

**DECISION NEEDED:** confirm "copy → promote to forge" rather than extracting an `@echo/shared`.

### OQ-5: Asset pipeline — placeholder or real art?

**Options:**
- (a) **Placeholder coloured squares + emoji-tier sprites + the `__default__` atlas everywhere** for v1 demos. Real art is post-`main`.
- (b) Real art per subsystem. Multiplies scope by 7.

**Recommendation.** (a). Demos are about feel, mechanics, and forge pressure-testing. Real art is a separate phase, post-Phase 8.

**DECISION NEEDED:** confirm placeholder-only through Phase 8.

### OQ-6: Audio — out for individual demos, in for `main`?

**Options:**
- (a) **Out for v1 demos** (recommended). Forge has no audio subpath today.
- (b) Out for individual demos but in for `main` only — would require a forge audio subpath (post-v1 forge work).
- (c) In for everything from day one.

**Recommendation.** (a). Audio absence is a known limitation; flag in §9 risks. Add a future forge `/audio` subpath only when `main` proves demos-without-audio feel hollow enough to justify it.

**DECISION NEEDED:** confirm no-audio through Phase 8.

### OQ-7: Visual verification — Playwright in CI or manual smoke?

**Options:**
- (a) **Per-subsystem replay-as-test for logic + manual visual smoke after each Pages deploy** (recommended). Matches forge's approach.
- (b) Playwright in CI per-subsystem. Real visual diffing — but adds CI weight, flake risk, and asset-management overhead.

**Recommendation.** (a) for v1 demos. Visual diffing is a post-`main` initiative, not per-demo.

**DECISION NEEDED:** confirm replay-as-test only; no Playwright in CI through Phase 8.

### OQ-8: Single workflow with sequential build vs matrix?

Already touched on in §6. v1 uses a single sequential build. Matrix per-subsystem becomes attractive only if total CI time exceeds ~3 minutes — at that point split.

**Recommendation.** Sequential for v1. Revisit at Phase 4 once we have a real measurement.

**DECISION NEEDED:** confirm sequential CI for v1.

### OQ-9: `main` as a workspace or its own repo?

**Options:**
- (a) **In-repo `main/` workspace** (recommended). Composes already-validated subsystems; no point splitting.
- (b) Separate repo. Adds friction without benefit; subsystem patterns would be copy-only (no path imports).

**Recommendation.** (a). The whole monorepo strategy assumes co-location of subsystems and the composed game.

**DECISION NEEDED:** confirm `main/` lives in-repo.

---

## 9. Risks

### R1 — Scope creep per demo

Each subsystem balloons beyond ~700 LOC (target ~500). **Mitigation:** every phase has a hard LOC budget called out in §7. If a subsystem hits 1000 LOC, stop and review what to cut. Demos are cuts of the final game, not the final game in miniature.

### R2 — Forge promotion forces breaking changes

A forge promotion (e.g., particles primitive in v0.3.0) breaks earlier subsystems on older minors. **Mitigation:** the version-drift policy (§5) tolerates this until Phase 8. The Phase 8 alignment task explicitly budgets for re-recording any replay that drifts. Worst case we burn a day re-recording 7 fixtures.

### R3 — Bun workspace + GitHub Pages multi-bundle deploy roughness

Edges: workspace install behaviour with private packages, `bun --filter` script discovery, aggregating `_site/` correctly across N subsystems and the Astro hub. **Mitigation:** Phase 0 includes a smoke-test deploy with placeholder content. CI proves the aggregation pattern works **before** any real subsystem ships. If `bun --filter '*' build` is unreliable on the installed bun version, fall back to an explicit shell loop.

### R4 — Subsystem version drift becomes integration debt

By Phase 7 we may have subsystems on forge v0.2.0, v0.2.5, v0.3.0, v0.3.2, v0.4.0. Aligning all seven to v0.5.0 in Phase 8 may surface multiple forge breaking-change cascades at once. **Mitigation:** track each subsystem's pinned forge version in this plan (or a `versions.md` companion); when a forge minor lands, optionally pre-align the subsystem currently being touched. Don't let drift exceed two minors.

### R5 — Placeholder asset fatigue

Every demo looking visually identical (coloured squares, default atlas) makes them feel samey when shown side-by-side. Demos lose their distinctiveness. **Mitigation:** lean on tints, particles, and motion to differentiate. Flag for Phase 9+ to replace placeholders with real art before any public showcase.

### R6 — Audio absence

Demos with sound feel like games; demos without sound feel like tech demos. **Mitigation:** known limitation; documented in §8 OQ-6. Reassess at Phase 8 — if the composed `main` feels lifeless, ship a forge `/audio` subpath as part of v0.5.0 or v0.6.0.

### R7 — Replay-as-test brittleness from forge non-determinism

If a forge bump introduces non-determinism (a new Math.random(), an iteration-order change), every replay fixture breaks. **Mitigation:** forge's `tools/no-throws.ts` lint already catches the obvious cases. For iteration-order regressions, the Phase 8 alignment serves as a catch-all. Upstream forge has its own determinism CI gate per the forge plan §7.

### R8 — Subsystem 7 / hub-landing naming clash confuses reviewers

`/hub/` (landing) vs `/subsystems/hub/` (game) — easy to mix up in plan text and devpad tasks. **Mitigation:** consistent prefixing in conversation ("the hub site" vs "the hub subsystem"). Rename to `/site/` if it becomes a real problem. Code-side imports never collide because the directories are distinct workspace paths.

### R9 — `main` integration phase ends up rewriting half of every subsystem

Subsystem patterns may not compose cleanly when concatenated. **Mitigation:** Phase 8 budgets a sequential head for "alignment + retrospective fixes" before parallel work begins. Plan for ~30% retrospective edit-back into subsystem code during Phase 8.

---

## 10. Reference quotes

Canonical paths for implementing coders. Read these before writing code in the corresponding phase.

| Topic | Path | Phase |
|---|---|---|
| Per-subsystem `package.json` shape | `~/dev/coin-collector/package.json` | Phase 0+ |
| Per-subsystem `tsconfig.json` shape | `~/dev/coin-collector/tsconfig.json` | Phase 0+ |
| Single-bundle Pages deploy (extend to multi) | `~/dev/coin-collector/.github/workflows/pages.yml` | Phase 0 |
| Forge multi-bundle CI aggregation | `~/dev/forge/.github/workflows/docs.yml` | Phase 0 |
| Forge release flow (separate forge repo, OIDC publish) | `~/dev/forge/.github/workflows/publish.yml` | Phase 1+ (when forge bumps) |
| `boot()` wiring pattern in browser entry | `~/dev/coin-collector/src/main.ts` | Phase 1+ |
| `game_plugin(world, schedule)` registration | `~/dev/coin-collector/src/plugin.ts` | Phase 1+ |
| Components definition shape | `~/dev/coin-collector/src/components.ts` | Phase 1+ |
| Resources definition shape | `~/dev/coin-collector/src/resources.ts` | Phase 1+ |
| Startup-system level setup | `~/dev/coin-collector/src/level.ts` | Phase 1+ |
| Movement / input system pattern | `~/dev/coin-collector/src/systems/movement.ts` | Phase 1+ |
| Replay-as-test fixture | `~/dev/coin-collector/test/replay.test.ts` | Every phase |
| Headless plugin smoke test | `~/dev/coin-collector/test/plugin.test.ts` | Every phase |
| Replay-recording tool | `~/dev/coin-collector/tools/record-win.ts` | Every phase |
| Sample replay JSON shape | `~/dev/coin-collector/replays/win.replay.json` | Every phase |
| Subsystem `index.html` | `~/dev/coin-collector/index.html` | Phase 0+ |
| Forge engine API surface (catalogue) | `~/dev/forge/docs/src/data/exports.ts` | Every phase |
| Forge live docs | `https://f0rbit.github.io/forge/` | Every phase |
| Forge agent conventions | `~/dev/forge/AGENTS.md` | Every phase |
| Forge plan §3 architecture (design-doc structure mirrored here) | `~/dev/forge/PLAN.md` §3 | (this doc) |
| Forge plan §9 phased build (LOC budget pattern mirrored here) | `~/dev/forge/PLAN.md` §9 | (this doc) |

---

## 11. Suggested `AGENTS.md` updates

These should be captured in `~/dev/echo/AGENTS.md` after user approval (NOT written automatically):

- **Strict no-shared-package policy.** Subsystems never import from each other or from a shared sibling; copy game-side, then propose a forge promotion when 2+ subsystems duplicate. Document the promotion criteria from §5.
- **Each subsystem has its own short tsconfig path alias** (`@dw`, `@bst`, `@ar`, `@lt`, `@pr`, `@bs`, `@hb`). Cross-subsystem aliases are NOT wired up at the root.
- **Replay-as-test is the gate for "subsystem done."** Every PR that closes a subsystem phase ships a recorded replay fixture and a deterministic assertion. No exceptions.
- **Forge version drift between subsystems is allowed** during phase development; the Phase 8 alignment task absorbs the cost of harmonising them. Document the per-subsystem pinned forge version somewhere (in this PLAN.md under §5, or in a companion `versions.md`).
- **Visual smoke is post-deploy and manual.** No Playwright in CI through Phase 8.
- **Placeholder art is intentional through Phase 8.** Real art is its own phase, after `main` is playable.
- **Audio is out-of-scope through Phase 8.** Reassess at Phase 8 review.
- **Naming: `hub` is used for two distinct things** — the `/hub/` landing site and the `/subsystems/hub/` in-game NPC demo. Prefix in conversation ("hub site" vs "hub subsystem"). Code paths never collide.
- **Determinism is a hard rule inherited from forge.** Game code follows forge's no-`Date.now`, no-`Math.random`, no-`setTimeout` policy outside of `*-pixi*` files. The forge `tools/no-throws.ts` lint script runs upstream; echo doesn't need its own gate.
