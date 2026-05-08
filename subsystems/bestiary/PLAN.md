# bestiary — subsystem plan

> Status: scoping. No code in this directory yet. The user reviews + approves before any scaffolding.
>
> Audience: future Claude sessions, future agents, the user. Single source of truth for the `bestiary` subsystem until v1 ships.
>
> Parents: `~/dev/echo/PLAN.md` §4.2 (subsystem catalogue entry), §5 (forge promotion gates), §7 (phase plan).

---

## 1. Overview

`bestiary` is echo's **second** subsystem. It pressure-tests forge's primitives for **enemy AI**: state machines, periodic ticks, FOV-based aggro detection, line-of-sight projectile shapes, and pathfinding over a grid. Where `dungeon-walk` was about *the player traversing a generated map*, bestiary is about *NPCs that act under their own logic, distinguishably*.

Combat is **out of scope**. There is no health, damage, death, or hit-stop. Enemies behave; the player observes. A future `arena` subsystem owns combat feel. Surgical separation of concerns — bestiary is the AI demo.

### What bestiary surfaces against forge v0.3.0

| Forge surface | Use site | Friction expectation |
|---|---|---|
| `@f0rbit/forge/grid` `g.line_of_sight` | every aggro check | Same shape as dungeon-walk's FOV — no new friction |
| `@f0rbit/forge/grid` `g.line` | ranged enemy telegraph + projectile path | Same shape — no new friction |
| `@f0rbit/forge/grid` `g.move_tile` | player + chaser + minion stepping | Multiple movers per tick — surface ordering / tie-breaking |
| `@f0rbit/forge/grid` `grid_index` | "is there an enemy at this cell?" | First heavy consumer; surfaces refresh-cost questions |
| `schedule.add(stage, sys, { every, phase })` | per-archetype AI ticks at different rates | Phase-staggering 4 archetypes is the new exercise |
| `world.spawn_many` + `world.despawn_marked` | summoner spawning, restart cleanup | Already proven |
| **A\*** | not in forge — game-side | Strong v0.4.0 promotion candidate |
| **Per-entity FSM** | not in forge — game-side | Weak v0.4.0 promotion candidate; depends on reuse |

### Predicted forge v0.4.0 candidates (record only, do not decide)

1. **`g.astar(from, to, { passable })`** — A\* pathfinding. Used by chaser archetype every N ticks. Strong "every game" candidate (boss adds, summoner minion routing, future `arena` waves all need it). **Top promotion candidate** of this subsystem.
2. **A tiny per-entity FSM** — `fsm({ states, initial, on_enter, on_exit })` returning a `state_c<S>` component plus a step system. Weak candidate: shape varies wildly between archetypes. Hold game-side; revisit after `boss` (which needs scripted phases).
3. **`debug.line(from, to, { color })`** — already exists in forge. No new surface.

---

## 2. Game design

### Pitch

A single 30×20 walled arena with the player + four enemy archetypes, each acting under distinct AI. The player has 4-way grid movement; **no combat**. The win condition is "observe the demo." A debug overlay (toggled with `Tab`) reveals each enemy's internal state, current pathfind path, and FOV cone. The overlay *is* the deliverable — it makes AI behaviour legible.

### Pillars

| # | Pillar |
|---|---|
| P1 | **Four distinct AI shapes, side-by-side.** Distinguishability is the point. |
| P2 | **No combat — observation only.** Bestiary is the AI demo, not the gameplay demo. |
| P3 | **Replay-deterministic AI.** Same seed + same scripted player input = byte-identical world hash. |
| P4 | **Debug overlay reveals internals.** State, paths, FOV cones drawn live; the overlay is the contract for "AI is doing what it claims." |
| P5 | **Periodic AI tick.** Enemies "think" every 12 ticks (~5/sec at 60 Hz). Movement decoupled from rendering. |

### Arena

- Single room, **30 cols × 20 rows**, tile = 16 (480×320 design canvas? — tightened to 320×180 to match dungeon-walk's mode `extend`. See §7.).
- Walls only at the borders + a handful of interior pillars (~6 cells). No corridors, no rooms.
- Procedural pillar placement seeded by `ctx.rng` — variety run-to-run, deterministic per seed.
- Player spawn: top-left quadrant. Each archetype: scattered through the rest of the room at fixed (per-seed) cells.

### Player

- 4-way grid movement (`presets.movement_2d` + `R` restart + `Tab` debug-toggle).
- `g.move_tile` with `blocked_by = wall_or_pillar`. Player **does not** collide with enemies — they pass through each other freely (otherwise the demo gets stuck behind a chaser; combat will introduce collision in `arena`).
- No HP, no death, no win/lose state. Restart (R) just resets the arena.

### Enemy archetypes (four)

| Archetype | Behaviour summary | Forge surface stressed |
|---|---|---|
| **Chaser** | When player in line-of-sight: A\* pathfind toward player, advance one cell per AI tick. When LOS lost: hold last-known cell for ~24 ticks ("memory"), then return to idle. | A\*, `g.line_of_sight`, `g.move_tile` |
| **Patroller** | Walks a fixed 4-waypoint loop (per-seed loop placement). On detection (FOV cone of 5 cells, 90° forward from facing): pursues by simple Chebyshev gradient toward player for ~48 ticks; then returns to nearest waypoint. | `g.line_of_sight` (cone-shaped), `g.move_tile`, FSM |
| **Ranged** | Stationary. Every 60 ticks: if LOS to player → telegraph by drawing `g.line` from self to player for 30 ticks; on tick 30, "fire" — push event into `ai_events_r` buffer + flash debug line in red. No projectile entity (one-frame raycast — see §10 OQ-5). | `g.line`, `g.line_of_sight`, periodic schedule |
| **Summoner** | Stationary. Every 120 ticks: if alive minion count `< 3` and player in LOS → spawn 1 minion at a random adjacent open cell. Minion = small chaser with same A\* logic but speed 1 cell per 18 ticks (slower than chasers). | `world.spawn_many`, `g.line_of_sight`, periodic schedule |

### Goal

There is none. The player walks around. The debug overlay (`Tab`) shows what each enemy is doing. Restart (`R`) re-rolls the seed and re-spawns every entity.

### Restart

Same shape as dungeon-walk's `restart_system` (proven pattern). Despawns every marker (`floor_c`, `wall_c`, `player_c`, every archetype marker, `minion_c`, `pillar_c`); regenerates the arena with `base + ++restart_count` seed. The `ai_events_r` buffer is cleared.

---

## 3. File layout

Mirrors `subsystems/dungeon-walk/` with AI-specific additions. **No** cross-subsystem imports — copy where appropriate (per echo's no-shared-package policy).

```
~/dev/echo/subsystems/bestiary/
├── package.json                    # @f0rbit/forge@^0.3.0 + pixi.js@^8 + corpus + zod
├── tsconfig.json                   # extends echo root; alias @bst/*
├── index.html                      # mirror of dungeon-walk/index.html
├── FRICTION.md                     # subsystem-specific friction log
├── PLAN.md                         # this file
├── src/
│   ├── components.ts               # ~70 LOC — archetype markers, state, path, telegraph
│   ├── resources.ts                # ~40 LOC — arena, ai_events buffer, debug-overlay flag
│   ├── bindings.ts                 # ~15 LOC — movement_2d + restart + debug_toggle
│   ├── grid.ts                     # ~5 LOC — `g = grid({ cols: 30, rows: 20, tile: 16 })`
│   ├── arena-gen.ts                # ~80 LOC — borders + pillars + spawn placement
│   ├── astar.ts                    # ~80 LOC — pure A* over `Grid` + passable predicate
│   ├── fsm.ts                      # ~30 LOC — tiny per-archetype state helper
│   ├── plugin.ts                   # ~50 LOC — schedule wiring
│   ├── main.ts                     # ~50 LOC — boot + Tab handler + plugin
│   └── systems/
│       ├── input.ts                # ~30 LOC — axes → player dir + Tab toggle
│       ├── movement.ts             # ~25 LOC — player tile-step (g.move_tile)
│       ├── sprite-attach.ts        # ~50 LOC — atlas frame + tint per archetype/marker
│       ├── restart.ts              # ~25 LOC — copy of dungeon-walk pattern
│       ├── debug-overlay.ts        # ~80 LOC — Tab-gated lines/rects for state/path/FOV
│       └── ai/
│           ├── chaser.ts           # ~80 LOC — LOS check → A* request → step
│           ├── patroller.ts        # ~70 LOC — waypoint loop + cone aggro
│           ├── ranged.ts           # ~60 LOC — telegraph + fire-event
│           └── summoner.ts         # ~50 LOC — periodic spawn + cap
├── test/
│   ├── replay.test.ts              # ~120 LOC — 5-second deterministic replay assertion
│   ├── chaser.test.ts              # ~80 LOC — LOS gain/lose, path advance
│   ├── patroller.test.ts           # ~60 LOC — waypoint loop, cone aggro
│   ├── ranged.test.ts              # ~60 LOC — telegraph timing, fire event
│   ├── summoner.test.ts            # ~60 LOC — cap behaviour, spawn cadence
│   └── astar.test.ts               # ~80 LOC — pure-function tests for A*
├── tools/
│   └── record-arena.ts             # ~60 LOC — scripted-input arena traversal
└── replays/
    └── arena.replay.json           # ~5 KB — recorded 300-tick player walk
```

**Total estimated LOC** (game code, excluding tests): **~700**.
**With tests**: **~1,160**.
**Over the 600-LOC original sketch** by ~15%, justified by 4 archetypes + debug overlay + A\*.

---

## 4. Components & resources

Naming follows forge convention: `_c` for components (snake_case names), `_r` for resources, branded markers as `Component<true>`. Data-bearing components carry their data type explicitly. **No new conventions invented.**

### Components

```ts
// src/components.ts (sketch — counts roughly accurate)

import { component, type Component } from "@f0rbit/forge";
import type { Cell } from "@f0rbit/forge/grid";

export type Dir       = { dx: -1 | 0 | 1; dy: -1 | 0 | 1 };
export type AiState   = "idle" | "alerted" | "chasing" | "returning" | "telegraphing";
export type Path      = { cells: readonly Cell[]; idx: number };
export type Patrol    = { waypoints: readonly Cell[]; idx: number; facing: Dir };
export type Telegraph = { from: Cell; to: Cell; fires_at_tick: number };

// Markers (Component<true>)
export const player_c    = component<true>("bst.player");
export const wall_c      = component<true>("bst.wall");
export const pillar_c    = component<true>("bst.pillar");
export const floor_c     = component<true>("bst.floor");
export const chaser_c    = component<true>("bst.chaser");
export const patroller_c = component<true>("bst.patroller");
export const ranged_c    = component<true>("bst.ranged");
export const summoner_c  = component<true>("bst.summoner");
export const minion_c    = component<true>("bst.minion");

// Data
export const dir_c       = component<Dir>("bst.dir");
export const state_c     = component<AiState>("bst.state");
export const path_c      = component<Path>("bst.path");
export const patrol_c    = component<Patrol>("bst.patrol");
export const telegraph_c = component<Telegraph>("bst.telegraph");
export const cooldown_c  = component<{ next_at_tick: number }>("bst.cooldown");
```

**DECISION NEEDED — DECISION-1: archetype = enum vs marker components?** See §10 OQ-1.
Recommendation in plan: **separate marker components**. Reasoning: archetype-specific systems can `query([archetype_c, ...])` directly; no per-tick switch on an enum field; cheaper iteration; matches forge's marker idiom. Storage cost is one extra symbol per archetype, negligible.

### Resources

```ts
// src/resources.ts (sketch)

export type Arena      = { cols: number; rows: number; floors: ReadonlySet<number>; spawn: Cell };
export type RunSeed    = { base: number; restart_count: number };
export type AiEvent    = { kind: "telegraph_fired" | "minion_spawned"; at: Cell; tick: number };
export type AiEvents   = { entries: AiEvent[] };
export type Debug      = { overlay_visible: boolean };

export const arena_r       = resource<Arena>("bst.arena");
export const run_seed_r    = resource<RunSeed>("bst.run_seed");
export const ai_events_r   = resource<AiEvents>("bst.ai_events");
export const debug_r       = resource<Debug>("bst.debug");
```

`ai_events_r.entries` is **append-only within a tick, drained at the start of each schedule.tick** — same shape as forge's existing `anim_events_r`. The replay test asserts events appear at expected ticks; the in-game render can read it for visual confirmation if useful.

---

## 5. Systems

Order matters. Determinism rule: **systems run in insertion order; AI must read player position before any AI moves; AI movements must complete before the spatial index refreshes for next tick**. The schedule below encodes that.

### Schedule wiring

```ts
// src/plugin.ts (sketch)

sch.add("startup", arena_gen_system, "bst.gen");
sch.add("pre",     restart_system,       "bst.restart");
sch.add("pre",     grid_index_sync_sys,  "bst.idx_sync");      // refreshes the enemy grid_index
sch.add("pre",     ai_event_drain_sys,   "bst.events_drain");  // clears prior tick's events buffer
sch.add("update",  input_system,         "bst.input");
sch.add("update",  player_movement_sys,  { every: step_every,  name: "bst.player_move" });
sch.add("update",  ai_chaser_sys,        { every: ai_tick,     phase: 0, name: "bst.ai_chaser" });
sch.add("update",  ai_patroller_sys,     { every: ai_tick,     phase: 1, name: "bst.ai_patroller" });
sch.add("update",  ai_ranged_sys,        { every: ai_tick,     phase: 2, name: "bst.ai_ranged" });
sch.add("update",  ai_summoner_sys,      { every: ai_tick * 2, phase: 3, name: "bst.ai_summoner" });
sch.add("post",    sprite_attach_system, "bst.sprites");
sch.add("render",  debug_overlay_system, "bst.debug_overlay");
```

- `ai_tick = 12` (ticks per AI step). Roughly 5 AI steps/sec at 60 Hz.
- Phase-staggered to spread work across consecutive ticks (chaser tick 0, patroller tick 1, etc.). Determinism preserved — each system still runs every 12 ticks; only the offset varies.
- `step_every = ticks_per_step(6, 1/60) === 10` (player walks at 6 cells/sec, same as dungeon-walk).

### Per-archetype systems

#### Chaser (`ai/chaser.ts`)

1. Read player position from `query([pos_c, player_c])`.
2. For each `[id, pos, state]` in `query([pos_c, state_c, chaser_c])`:
   - Compute `los = g.line_of_sight({ from: cell(pos), radius: 8, is_blocking: walls_or_pillars })`.
   - **State transitions**:
     - `idle` + LOS to player → `chasing`; request A\* path; store `path_c`.
     - `chasing` + LOS lost → `alerted` (memory) for next 2 AI ticks; keep last path.
     - `alerted` + still no LOS after 2 AI ticks → `idle`; clear `path_c`.
     - `chasing` + still LOS, but player moved off path → re-A\* every 3 AI ticks (cooldown via `cooldown_c`).
   - **Movement**: if `path_c` and `idx < cells.length`, advance one cell with `g.move_tile`. If blocked (e.g. another enemy), skip this tick — no replan (next AI tick reconsiders).

#### Patroller (`ai/patroller.ts`)

1. State: `idle` (walking waypoint loop) | `alerted` (chasing player by Chebyshev gradient) | `returning` (back to nearest waypoint).
2. Detection: cone of 5 cells, 90° forward from `patrol_c.facing`. Implementation: `g.line_of_sight({ from, radius: 5 })` → filter results by `dot(cell - from, facing) > 0` (cone gate).
3. `alerted` lasts up to 48 ticks; if player still in cone at expiry, refresh; else `returning`.
4. `returning` walks back to nearest waypoint then resumes loop.
5. Step uses `g.move_tile` toward target cell using greedy Chebyshev (no A\* — patrolling is constrained, doesn't need it).

#### Ranged (`ai/ranged.ts`)

1. `cooldown_c` tracks `next_at_tick`.
2. If `now >= next_at_tick` and LOS to player:
   - Set `state = telegraphing`; insert `telegraph_c` with `from = self_cell`, `to = player_cell`, `fires_at_tick = now + 30`.
3. If `state == telegraphing` and `now >= telegraph_c.fires_at_tick`:
   - Push `{ kind: "telegraph_fired", at: telegraph_c.to, tick: now }` into `ai_events_r.entries`.
   - Remove `telegraph_c`; set `state = idle`; `next_at_tick = now + 60`.

#### Summoner (`ai/summoner.ts`)

1. `cooldown_c` tracks `next_at_tick`.
2. If `now >= next_at_tick` and LOS to player and `count(minion_c) < 3`:
   - Pick a random adjacent open cell (deterministic — `ctx.rng.fork("summoner")`-style or a seeded sub-rng).
   - `world.spawn` a minion: `pos_c`, `minion_c`, `state_c: "idle"`, no `path_c` yet.
   - Push `{ kind: "minion_spawned", at: cell, tick: now }` into `ai_events_r.entries`.
   - `next_at_tick = now + 120`.
3. Minions are picked up by `ai_chaser_sys` via the marker — minions and chasers share the chaser logic but minions move every 18 ticks (different `every` gate). **DECISION NEEDED — DECISION-2:** see §10 OQ-2.

### Shared support

- `arena_gen_system` — Place borders + ~6 pillars (RNG-seeded). Spawn player at fixed cell (top-left). Spawn one chaser, one patroller, one ranged, one summoner at fixed per-seed cells. Spawn floor markers for every floor cell (so `sprite-attach` can render them — same pattern as dungeon-walk).
- `player_movement_sys` — copy of dungeon-walk's `movement_system`, minus the win-condition. `blocked_by` is `wall_or_pillar` (not enemy).
- `restart_system` — copy of dungeon-walk's pattern; despawns markers, calls `regenerate_arena` with bumped seed.
- `sprite_attach_system` — copy of dungeon-walk's pattern, extended for archetype frames (see §7).
- `debug_overlay_system` — runs only when `debug_r.overlay_visible`. For each enemy: `debug.text(state)`, `debug.line(path segments)` for chasers, `debug.rect(cone area)` for patrollers, `debug.line(self → telegraph_c.to)` for ranged.

### A\* (`astar.ts`) — game-side

Pure function over `Grid` + `passable: (cell: Cell) => boolean`:

```ts
export const astar = (
  g: Grid,
  from: Cell,
  to: Cell,
  passable: (c: Cell) => boolean,
  max_steps = 200,
): readonly Cell[] | null
```

- 4-neighbour movement (8-neighbour later if needed).
- Heuristic: Manhattan (`g.manhattan`).
- Tie-breaking: lower `f` first; on ties, lower `h`; on ties, lower `key(cell)`. **Determinism is load-bearing** — the binary heap implementation must order ties by `key(cell)` to keep replay hashes stable.
- Returns `null` if unreachable or `max_steps` exceeded.
- Roughly 70-80 LOC including a tiny binary heap.

A\* is called once per AI tick per chaser when state changes to `chasing` or every 3 AI ticks while chasing. Cost: 4 chasers × ~10 calls/sec × ~50-cell grid ≈ trivial.

### FSM (`fsm.ts`) — game-side

Deliberately tiny. Per-archetype systems express transitions imperatively (`if (state === "idle" && los) state = "chasing"`). The "FSM" helper is just `transition(w, id, next): set state_c, optional on_enter`. **~30 LOC**, possibly inlined into each archetype system. **Held game-side** (see §6).

---

## 6. Forge consumption + predicted v0.4.0 candidates

### Consumed primitives (no friction expected)

| Surface | Use site | Notes |
|---|---|---|
| `world` core (spawn / despawn / query / set / has) | every system | Marker-elision and tuple-return shape match dungeon-walk |
| `schedule.add(stage, sys, { every, phase, name })` | AI systems | Phase staggering is new — exercises the docs |
| `time.tick`, `time.fixed_dt` | cooldowns, telegraph timing | Determinism contract |
| `ctx.rng` | arena gen, summoner spawn cell | Forking per-archetype if needed |
| `ctx.input.just("debug_toggle")` | Tab key | Same edge semantics as restart |
| `pos_c` | every entity | Canonical |
| `@f0rbit/forge/grid` `grid({...})` | bestiary's grid | One-line factory |
| `g.cell_to_world / world_to_cell / key / unkey` | arena gen + AI cell queries | Same shape |
| `g.in_bounds / chebyshev / manhattan / neighbors4` | A\* heuristic + neighbour expansion | Manhattan as heuristic |
| `g.line` | ranged telegraph render | Render-stage iteration |
| `g.line_of_sight` | every aggro check | Heaviest consumer — 4+ enemies × per-AI-tick |
| `g.move_tile` | player + every chaser/minion/patroller | Multiple movers per tick |
| `ticks_per_step` | player + AI step gates | One call site per gate |
| `@f0rbit/forge/pixi` `boot`, `sprite_c`, `sprite.set` | render | Same shape |
| `@f0rbit/forge/pixi` `debug.line / rect / text` | debug overlay | First heavy debug-overlay subsystem |
| `harness, replay` | tests | Same shape |
| `presets.movement_2d` | bindings | Replay-continuity preference (see §7) |

### Friction expected (record in `FRICTION.md` as work proceeds)

1. **A\* is missing from forge** — Strong promotion candidate for v0.4.0. Used by every game with non-trivial grid AI. See §10 OQ-2 for shape.
2. **`grid_index` consumer ergonomics** — first heavy consumer. We may surface refresh-cost questions ("should it auto-track `pos_c` mutations or rebuild every tick?"). Today's API rebuilds via the sync system in `pre`. Likely fine for ≤ 30 entities; document if not.
3. **Multi-mover ordering & blocking** — When chaser A wants cell X and minion B also wants cell X this tick, what happens? Today: insertion order wins, second `move_tile` blocks. Document the behaviour; flag as friction if it produces visible jitter.
4. **`debug.line` styling for state visualisation** — May want per-state colours (yellow alerted, red chasing, green idle). Today's `debug.line(a, b, color)` takes a `Color`. Should be sufficient — flag if it isn't.
5. **No projectile-as-entity helper** — Ranged enemy uses an instant raycast (no projectile entity). If the requirement evolves to projectile entities (move-along-line over ticks), we'd hand-roll it. Not a forge candidate yet (one consumer).
6. **AI tick phase staggering** — `{ every: 12, phase: 0..3 }` is new use of the v0.3.0 unified `add` signature. Validates that the docs cover it.
7. **State-machine repetition** — All four archetypes have an `idle | alerted | chasing | returning` shape. If two more subsystems need this exact shape, promote a `fsm()` helper to forge. **Hold game-side for now** (1 subsystem ≠ promotion).

### Top forge v0.4.0 candidate

**`g.astar(from, to, { passable, max_steps?, neighbors? })`** as a method on the `Grid` record (matching v0.3.0's `g.line` / `g.line_of_sight` / `g.move_tile` shape). ~80 LOC including a binary heap. Returns `readonly Cell[] | null`. Determinism: tie-break by `key(cell)`. **Reasoning**: every game with non-trivial grid AI needs A\*. Boss adds, future arena waves, and any enemy that needs to pursue around cover need it. The shape is well-understood, mature, and matches the existing grid-method idiom.

The Phase 8 alignment review will decide; bestiary itself ships with the game-side `astar.ts` and Phase 8 deletes it on bump.

### Held game-side (deliberately)

- **FSM helper** — shape varies between archetypes; promote only if `boss` and one more subsystem need the same per-entity FSM. Today inline `if/else` is cheap and clear.
- **Telegraph component pattern** — single consumer; forge has no opinion.
- **AI events buffer pattern** — `ai_events_r` mirrors forge's existing `anim_events_r`. No promotion needed.

---

## 7. Visual style + asset use

Same constraints as dungeon-walk: **placeholder `__default__` atlas only**, 4-frame magenta/cyan/yellow/black, 16×16 frames. No real art through Phase 8.

### Atlas frame mapping

| Entity | Frame | Tint | Scale | Notes |
|---|---|---|---|---|
| Player | `__default_0__` (magenta) | `0xffffff` | 1× | Same as dungeon-walk |
| Floor | `__default_1__` (cyan) | `0x444444` | 1× | Slightly darkened to make entities pop |
| Wall / pillar | `__default_3__` (black) | — | 1× | Border + interior pillars |
| Chaser | `__default_2__` (yellow) | `0xff4444` | 1× | Red tint = aggressive |
| Patroller | `__default_2__` (yellow) | `0x44ff88` | 1× | Green tint = patrolling |
| Ranged | `__default_2__` (yellow) | `0xff88ff` | 1× | Magenta tint = ranged |
| Summoner | `__default_2__` (yellow) | `0xff8800` | **2×** | Larger to read as "boss" |
| Minion | `__default_2__` (yellow) | `0xff4444` | **0.6×** | Smaller chaser-tinted |

Tints differentiate archetypes; scale differentiates summoner + minions. Five distinguishable enemy reads on a 4-frame atlas — sufficient for the demo.

### Camera

- `tile = 16`, design **480×320** (30×20 cells × 16). Mode `extend`, `min: { width: 480, height: 320 }`. Larger than dungeon-walk's 320×176 because the arena is 30×20 vs 20×11.
- **Risk**: design 480×320 may be too large for some host windows. Mitigation: same as dungeon-walk — `extend` mode shows more world on larger windows; `min` floors the design viewport. If the host can't fit 480×320, we drop to `mode: "fit"` (fractional scale) for that window. Acceptable for a demo.

### Telegraph rendering

Use `debug.line(from, to, 0xff0000)` for the ranged telegraph. **DECISION NEEDED — DECISION-3** (§10 OQ-3): does `debug.line` show in production builds (non-`__DEV__`)? If not, we need a real `telegraph_c` component + a render-stage system that draws it. Cheapest fix: add a `pixi.Graphics` overlay to `app.app.stage` (mirrors dungeon-walk's `win_overlay` text approach), drained by a render-stage system that reads `query([telegraph_c])`.

Recommendation: **dedicated render system + `Graphics`** (not `debug.line`) — debug overlay is for inspection, telegraphs are a gameplay-visible signal. The debug overlay can additionally trace the telegraph in a separate colour for AI introspection.

### Debug overlay (Tab toggle)

When `debug_r.overlay_visible === true`, the `debug_overlay_system` (render stage) emits per-enemy:

- `debug.text(self_cell + tile_offset, state)` — current state name
- `debug.line(path[i], path[i+1], 0xffff00)` for chaser path segments
- `debug.rect(cone_bounds, 0x00ff88)` for patroller cone
- `debug.line(self, predicted_target, 0xff00ff)` for ranged aim
- `debug.text(self, "minions: K/3")` on the summoner

Tab toggles the resource; the system is gated on the resource flag. Cost outside `__DEV__` is zero (forge's debug subsystem becomes no-op in production).

---

## 8. Replay test deliverable

The headline `bun test` test. Same shape as dungeon-walk's `test/replay.test.ts` plus AI-specific assertions.

### Recording

`tools/record-arena.ts`:

1. Boot harness with `seed = 7`, `fixed_dt = 1/60`, bestiary bindings.
2. Run startup tick once.
3. Inject ~300 ticks of scripted player movement. Path: walk into chaser's LOS → step away → wait → walk past patroller's cone → wait at a fixed cell while ranged telegraphs + fires + summoner spawns minions.
4. Stop the recorder, save to `replays/arena.replay.json`.

Reproducibility: same seed + same scripted input every time; the recorder is itself deterministic.

### Assertions (in `test/replay.test.ts`)

```ts
test("replay loads cleanly", ...);

test("seed 7 generates a deterministic arena with expected wall count", () => {
  // expect arena.floors.size === <recorded value>
});

test("chaser reaches expected cell by tick 60", () => {
  // step the harness 60 ticks (post startup), assert chaser's cell === recorded
});

test("ranged enemy fires at expected tick — ai_events_r contains a `telegraph_fired` event", () => {
  // step until the fire-tick, assert events buffer has the entry with kind + at + tick
});

test("summoner spawns first minion at expected tick", () => {
  // assert ai_events_r contains `minion_spawned` at the recorded tick + cell
});

test("patroller reaches waypoint #2 at expected tick", () => {
  // assert patroller's cell at tick N matches the second waypoint
});

test("two consecutive replays produce identical world hashes", () => {
  // hash := hash(player_cell, every enemy cell, every state, ai_events_r length)
  // run twice; assert byte-equal
});
```

The world-hash test is the determinism gate. It must pass on every commit.

### Per-archetype tests

Each archetype gets its own focused integration test (chaser.test.ts, etc.) that boots a tiny harness with one archetype + a teleported player, drives a few AI ticks, and asserts the expected transitions. ~60-80 LOC each. These are unit-ish in scope but use the harness (per the project's "integration over unit" principle).

`astar.test.ts` is the only true unit test — pure-function tests of the A\* helper (start == goal, unreachable, simple path, blocked path with detour, max-steps cutoff). ~80 LOC.

---

## 9. Phased build plan

Eight phases, each ending with a buildable + deployable demo (partial through P5; complete by P8). Verification + atomic commit between every phase per echo's hard rules.

### P0 — repo wiring (~50 LOC, sequential)

| Task | LOC | Files |
|---|---|---|
| `package.json` (mirror dungeon-walk; name `bestiary`) | ~25 | bestiary/package.json |
| `tsconfig.json` (extends echo root; alias `@bst`) | ~15 | bestiary/tsconfig.json |
| `index.html` (mirror dungeon-walk) | ~15 | bestiary/index.html |
| `src/grid.ts` (`g = grid({ cols: 30, rows: 20, tile: 16 })`) | ~3 | bestiary/src/grid.ts |
| `src/main.ts` minimal boot (empty plugin) | ~30 | bestiary/src/main.ts |
| `src/plugin.ts` empty plugin function | ~10 | bestiary/src/plugin.ts |
| Update echo's `/hub/` content collection — flip the bestiary card to "live" | ~20 | hub/src/content/demos/bestiary.mdx (path is illustrative; align to existing hub structure) |

**Deliverable**: bestiary deploys to `f0rbit.github.io/echo/bestiary/` with an empty canvas. CI green.
**Parallelisable?** No — single coder, sequential.
**Forge bump**: none.

### P1 — arena + player (~150 LOC)

| Task | LOC | Parallel? | Files |
|---|---|---|---|
| `src/components.ts` (player_c, floor_c, wall_c, pillar_c, dir_c) | ~30 | A | components.ts |
| `src/resources.ts` (arena_r, run_seed_r, debug_r) | ~25 | A | resources.ts |
| `src/bindings.ts` (movement_2d + restart + debug_toggle) | ~15 | A | bindings.ts |
| `src/arena-gen.ts` (borders + pillars + spawns) | ~80 | B (after A) | arena-gen.ts |
| `src/systems/input.ts` (axes + Tab edge) | ~30 | C | systems/input.ts |
| `src/systems/movement.ts` (g.move_tile player) | ~25 | C | systems/movement.ts |
| `src/systems/sprite-attach.ts` (player + floor + walls) | ~50 | D | systems/sprite-attach.ts |
| `src/systems/restart.ts` (despawn markers + regenerate) | ~25 | D | systems/restart.ts |
| `src/plugin.ts` wiring | ~30 | E (after A-D) | plugin.ts |
| `src/main.ts` (Tab handler) | ~20 | E | main.ts |
| Smoke test: player walks; restart works | ~30 | follow-on | test/restart.test.ts |

**Deliverable**: player walks an empty arena (with pillars). R restarts. No enemies yet.
**Parallel**: P1.A, P1.C parallel after P0; P1.B after A; P1.D after A; P1.E sequential head once A-D land.
**Forge bump**: none.

### P2 — A\* + chaser (~200 LOC)

| Task | LOC | Parallel? | Files |
|---|---|---|---|
| `src/astar.ts` + `test/astar.test.ts` | ~80 + 80 | A | astar.ts, astar.test.ts |
| Add `chaser_c`, `state_c`, `path_c`, `cooldown_c` to components.ts | ~15 | B | components.ts |
| `src/systems/ai/chaser.ts` (LOS → A\* → step) | ~80 | C (after A+B) | systems/ai/chaser.ts |
| Wire chaser into `plugin.ts` (every: 12, phase: 0) | ~5 | D (after C) | plugin.ts |
| Spawn one chaser in arena-gen | ~10 | D | arena-gen.ts |
| sprite-attach: chaser frame + tint | ~10 | D | systems/sprite-attach.ts |
| `test/chaser.test.ts` (LOS gain/lose, advance) | ~80 | follow-on | test/chaser.test.ts |

**Deliverable**: player + one chaser. Walking near it triggers visible pursuit. `bun test` green.
**Parallel**: A and B parallel; C waits on both; D follow-on.
**Forge bump**: none (A\* held game-side).

### P3 — patroller (~150 LOC)

| Task | LOC | Parallel? | Files |
|---|---|---|---|
| `src/fsm.ts` (tiny transition helper) | ~30 | A | fsm.ts |
| Add `patroller_c`, `patrol_c` to components.ts | ~10 | A | components.ts |
| `src/systems/ai/patroller.ts` (waypoints + cone aggro) | ~70 | B (after A) | systems/ai/patroller.ts |
| arena-gen: place patroller + waypoints | ~20 | B | arena-gen.ts |
| sprite-attach: patroller tint | ~5 | C | systems/sprite-attach.ts |
| Wire patroller (every: 12, phase: 1) | ~5 | C | plugin.ts |
| `test/patroller.test.ts` | ~60 | follow-on | test/patroller.test.ts |

**Deliverable**: chaser + patroller live. Patroller loops; alerts when player enters cone.
**Forge bump**: none.

### P4 — ranged (~150 LOC)

| Task | LOC | Parallel? | Files |
|---|---|---|---|
| Add `ranged_c`, `telegraph_c`, `ai_events_r` | ~15 | A | components.ts, resources.ts |
| `src/systems/ai/ranged.ts` (cooldown → telegraph → fire) | ~60 | B (after A) | systems/ai/ranged.ts |
| Telegraph render system (or `debug.line`-only, see DECISION-3) | ~40 | C | systems/telegraph-render.ts (TBD) |
| arena-gen: place ranged | ~10 | C | arena-gen.ts |
| sprite-attach: ranged tint | ~5 | C | systems/sprite-attach.ts |
| Wire ranged (every: 12, phase: 2) + ai_events_drain in pre | ~10 | D | plugin.ts |
| `test/ranged.test.ts` (telegraph timing, fire event) | ~60 | follow-on | test/ranged.test.ts |

**Deliverable**: ranged enemy telegraphs + fires (visible line + event in buffer).
**Forge bump**: none.

### P5 — summoner + minions (~120 LOC)

| Task | LOC | Parallel? | Files |
|---|---|---|---|
| Add `summoner_c`, `minion_c` to components.ts | ~10 | A | components.ts |
| `src/systems/ai/summoner.ts` (cap + spawn cell + cooldown) | ~50 | B (after A) | systems/ai/summoner.ts |
| arena-gen: place summoner | ~10 | C | arena-gen.ts |
| sprite-attach: summoner (2× scale) + minion (0.6× scale) | ~15 | C | systems/sprite-attach.ts |
| chaser system: include `minion_c` in queries OR spawn minions with `chaser_c` (DECISION-2) | ~10 | C | systems/ai/chaser.ts |
| Wire summoner (every: 24, phase: 3) | ~5 | D | plugin.ts |
| `test/summoner.test.ts` (cap, cadence) | ~60 | follow-on | test/summoner.test.ts |

**Deliverable**: all four archetypes live. Summoner spawns minions that pursue.
**Forge bump**: none.

### P6 — debug overlay + replay (~150 LOC)

| Task | LOC | Parallel? | Files |
|---|---|---|---|
| `src/systems/debug-overlay.ts` (state text, paths, cones, aim lines) | ~80 | A | systems/debug-overlay.ts |
| `tools/record-arena.ts` | ~60 | B | tools/record-arena.ts |
| Run recorder, commit `replays/arena.replay.json` | (~5 KB) | C (after B) | replays/arena.replay.json |
| `test/replay.test.ts` (load + 5-second deterministic assertion + world-hash equality) | ~120 | D (after C) | test/replay.test.ts |
| `FRICTION.md` first draft (record everything hit during P0-P5) | ~60 | parallel | FRICTION.md |

**Deliverable**: Tab-toggle reveals AI internals. Replay test green. `FRICTION.md` lists every friction encountered.
**Forge bump**: none.

### P7 — visual polish + Pages verify (~30 LOC)

| Task | LOC | Parallel? | Files |
|---|---|---|---|
| Tint adjustments (visual distinguishability pass) | ~15 | A | systems/sprite-attach.ts |
| Floor tile darkening for contrast | ~5 | A | systems/sprite-attach.ts |
| Confirm `f0rbit.github.io/echo/bestiary/` deploys + plays cleanly | — | follow-on | (manual smoke) |
| Update `FRICTION.md` with any final findings | ~10 | follow-on | FRICTION.md |

**Deliverable**: bestiary live at `f0rbit.github.io/echo/bestiary/`. Final commit. Subsystem done.
**Forge bump**: none expected (echo PLAN says "v0.2.x patches"; v0.3.0 already shipped, so this is "no bump").

### Cumulative LOC

| Phase | LOC delta | Cumulative |
|---|---|---|
| P0 | 50 | 50 |
| P1 | 150 | 200 |
| P2 | 200 (incl. 80 A\* test) | 400 |
| P3 | 150 | 550 |
| P4 | 150 | 700 |
| P5 | 120 | 820 |
| P6 | 150 | 970 |
| P7 | 30 | 1000 |

**Project total**: ~1,000 LOC including tests. Game source ~700, tests ~300. Within scope for a 6-7 day subsystem build at the demonstrated dungeon-walk velocity.

---

## 10. Open questions / decisions for user

### OQ-1 — DECISION-1: Single `enemy_c` with archetype enum vs separate marker components per archetype?

**Options:**
- (a) **Separate markers** (`chaser_c`, `patroller_c`, `ranged_c`, `summoner_c`, `minion_c`). Archetype-specific systems query directly: `query([pos_c, state_c, chaser_c])`. No per-tick switch.
- (b) **Single `enemy_c { archetype: "chaser" | ... }`** + a switch in a unified AI system. Fewer components; one system; easier to add a new archetype.

**Recommendation**: (a). Matches forge's marker idiom; cheaper iteration; archetypes diverge enough in shape that a single system would have a fat switch anyway. Storage cost is negligible.

**DECISION NEEDED**: confirm separate markers.

### OQ-2 — DECISION-2: A\* shape: pure function vs entity-component pattern?

**Options:**
- (a) **Pure function** `astar(g, from, to, passable, max_steps?) → readonly Cell[] | null`. Each AI system calls it directly when it wants a path; result stored in `path_c`. Stateless, easy to test.
- (b) **Entity-component pattern**: `path_request_c { from, to }` placed by AI; a `pathfind_system` consumes requests and writes back `path_c`. Decouples AI from pathfinding; allows budgeting (e.g. one A\* per tick).

**Recommendation**: (a). One subsystem doesn't justify the indirection. Boss + arena may push us to (b) later; bestiary's 4 chasers calling A\* synchronously is trivially affordable. The Phase 8 forge promotion can ship a pure function regardless.

**DECISION NEEDED**: confirm pure-function A\*.

### OQ-3 — Telegraph rendering: `debug.line` (auto-cleared) vs dedicated `telegraph_c` + render system?

**Options:**
- (a) **`debug.line(from, to, color)`** — already built into forge, drains every frame, free. **Risk**: forge's debug subsystem is `__DEV__`-gated (per dungeon-walk FRICTION §14: "ctx.debug.text(...) is unsuitable because it's __DEV__-gated and disappears in production"). Telegraphs are gameplay-visible — they should render in production.
- (b) **Dedicated `telegraph_c` component** + a render-stage system that draws PIXI `Graphics`. ~40 LOC, production-safe.

**Recommendation**: (b). Gameplay-visible signals don't belong on the debug overlay. The debug overlay can additionally trace the telegraph for AI introspection.

**DECISION NEEDED**: confirm dedicated render system.

### OQ-4 — Debug toggle key: `Tab` vs `F1` vs another?

**Options:**
- (a) **`Tab`** — easy to reach, no game uses it.
- (b) **`F1`** — conventional debug key.
- (c) **`` ` ``** (backtick) — forge's palette overlay (if it ever surfaces in a subsystem) might claim this.

**Risk**: forge's palette overlay may claim Tab or backtick. None of dungeon-walk's bindings collide; bestiary should check before locking.

**Recommendation**: **`Tab`**. Simple, standard, and the dev console (palette) is opt-in per-game (bestiary doesn't enable it).

**DECISION NEEDED**: confirm `Tab`.

### OQ-5 — Ranged "projectile": entity that moves along path vs instant raycast?

**Options:**
- (a) **Entity**: spawn `projectile_c { from, to, idx }`; advance one cell per tick along `g.line(from, to)`; despawn on reaching `to`. Slower telegraph, "real" projectile.
- (b) **Instant raycast**: at fire tick, push event to `ai_events_r`; debug overlay draws a flash for one frame. No entity; no per-tick advance.

**Recommendation**: (b). Combat is `arena`'s job; bestiary just needs to demonstrate the *signal*. Instant raycast keeps state simple; the visible telegraph (telegraph_c) is the player-visible part anyway.

**DECISION NEEDED**: confirm instant raycast.

### OQ-6 — Summoner cap behaviour at limit: skip spawn vs replace oldest?

**Options:**
- (a) **Skip** — if `count(minion_c) >= 3`, do nothing this tick.
- (b) **Replace** — despawn oldest minion, spawn fresh.

**Recommendation**: (a). Replace is mechanically interesting but costs determinism legibility (the oldest-tracking adds state). Cap-and-skip is cleaner for the demo.

**DECISION NEEDED**: confirm skip-on-cap.

### OQ-7 — Minions inherit chaser logic via shared `chaser_c` marker, or have their own `minion_c` system?

**Options:**
- (a) **Shared chaser_c**: summoner spawns minions with `chaser_c` + `minion_c`. The chaser system handles both. Speed differentiation via per-entity `cooldown_c`. **Simplest**.
- (b) **Dedicated minion system**: a copy of chaser logic running on `minion_c` only. More LOC; no benefit unless minion AI diverges.

**Recommendation**: (a). Minions ARE chasers, conceptually. The `minion_c` marker exists purely so we can despawn-on-restart and apply the smaller sprite scale.

**DECISION NEEDED**: confirm shared chaser_c.

---

## 11. Risks

### R1 — Determinism with multiple AI archetypes interacting

Ordering matters. If two enemies want the same cell on the same tick, the one whose system runs first wins; that ordering must be stable across replays. **Mitigation**: schedule order is fixed at insertion (chaser → patroller → ranged → summoner). The `ai_events_r` buffer is append-only; reads are by index. World hash test in §8 catches any non-determinism. Document the schedule order in `plugin.ts` comments.

### R2 — Performance: 30+ entities × per-tick FOV checks

`g.line_of_sight` over a 30×20 grid with a radius of 8 costs ~64 cells × ~8 line-walks = ~512 ops per check. 4 enemies × every 12 ticks = trivial. Mitigation if it surfaces: cache the player cell at the start of the AI tick (single computation); reuse across all enemies. **Not currently a concern.**

### R3 — A\* perf on small grids

Game-side A\* on a 30×20 grid with ≤ 200 max steps: trivial. **Concern only if grid scales** to e.g. 100×100 (out of scope).

### R4 — Visual distinguishability

Five enemy variants on a 4-frame atlas. **Mitigation**: tints + scale (see §7). If the user can't tell them apart in the demo, fall back to: thicker debug-overlay text labels by default (without requiring Tab). Flag if tints prove insufficient.

### R5 — Telegraph rendering hits the production-`__DEV__` gate

If we go with `debug.line` (OQ-3 option a), telegraphs vanish in production. **Mitigation**: OQ-3 recommends option (b) — dedicated render system. Already addressed.

### R6 — Multi-mover blocking jitter

Chaser A and minion B both target cell X this tick. Insertion-order winner moves; loser blocks. Visually: minion "sticks" for one AI tick. **Acceptable**. Document if it produces noticeable jitter.

### R7 — Summoner edge case: nowhere to spawn

If all 8 cells around the summoner are blocked (walls, minions, player), spawn fails. **Mitigation**: skip-and-retry-next-tick (already inherent in the cooldown-based design — no error, no event).

### R8 — `extend` mode at 480×320 design canvas may overflow some windows

Wider than dungeon-walk's 320×176. **Mitigation**: `extend` plus `min: { width: 480, height: 320 }` floors the design viewport. If the host window is < 480×320 the renderer letterboxes (forge's documented behaviour). Acceptable for demo.

### R9 — FRICTION.md drift

We may finish bestiary and forget to log smaller papercuts. **Mitigation**: `FRICTION.md` first draft scheduled in P6, *not* P7 — recorded while memory is fresh.

---

## 12. Suggested AGENTS.md updates

These should be captured in `~/dev/echo/AGENTS.md` after user approval (NOT written automatically):

- **AI systems run on periodic ticks via `schedule.add(stage, sys, { every, phase })`**, separate from per-tick movement systems. Default convention: `ai_tick = 12` ticks (~5 AI steps/sec at 60 Hz). Per-archetype `phase` staggering distributes work across consecutive ticks while preserving determinism.
- **A\* lives game-side until a forge minor promotes it.** Bestiary's `src/astar.ts` is the canonical shape: pure function over `Grid` + `passable` predicate, deterministic tie-break by `key(cell)`, returns `readonly Cell[] | null`. Phase 8 alignment will decide on forge promotion.
- **Per-archetype enemy markers, not enum fields.** `chaser_c`, `patroller_c`, etc. — matches forge's marker idiom, enables cheap per-archetype queries, and aligns with the marker-elision pattern from forge v0.3.0.
- **AI events use a per-tick `ai_events_r` buffer**, drained at the start of each `schedule.tick` (mirrors forge's `anim_events_r`). Replay tests assert events at specific ticks; the in-game render can read it for visual confirmation.
- **Gameplay-visible signals (telegraphs, projectiles) use dedicated render systems with PIXI `Graphics`**, NOT `debug.line`. The debug subsystem is `__DEV__`-gated and disappears in production builds.
- **Multi-mover ordering is by schedule insertion order.** When two enemies want the same cell on the same tick, the one whose system runs first wins; the other blocks. This is deterministic and replay-safe.
- **Bestiary surfaces A\* + per-entity FSM as candidate forge primitives.** A\* is the strong v0.4.0 candidate (every game wants it); FSM held game-side until 2+ subsystems share the shape.

---

## 13. Reference quotes (for implementing coders)

| Topic | Path | Phase |
|---|---|---|
| Subsystem `package.json` shape | `~/dev/echo/subsystems/dungeon-walk/package.json` | P0 |
| Subsystem `tsconfig.json` shape | `~/dev/echo/subsystems/dungeon-walk/tsconfig.json` | P0 |
| Subsystem `index.html` | `~/dev/echo/subsystems/dungeon-walk/index.html` | P0 |
| `boot()` + plugin wiring | `~/dev/echo/subsystems/dungeon-walk/src/main.ts` | P0+ |
| `game_plugin(world, schedule)` registration | `~/dev/echo/subsystems/dungeon-walk/src/plugin.ts` | P0+ |
| Components definition shape | `~/dev/echo/subsystems/dungeon-walk/src/components.ts` | P1+ |
| Resources definition shape | `~/dev/echo/subsystems/dungeon-walk/src/resources.ts` | P1+ |
| Procedural generation pattern | `~/dev/echo/subsystems/dungeon-walk/src/systems/dungeon-gen.ts` | P1 |
| `g.move_tile` + win-condition pattern | `~/dev/echo/subsystems/dungeon-walk/src/systems/movement.ts` | P1 |
| FOV consumer pattern | `~/dev/echo/subsystems/dungeon-walk/src/systems/fov.ts` | P2+ |
| `sprite_attach` + per-marker frame mapping | `~/dev/echo/subsystems/dungeon-walk/src/systems/sprite-attach.ts` | P1+ |
| Restart pattern | `~/dev/echo/subsystems/dungeon-walk/src/systems/restart.ts` | P1 |
| Replay-as-test | `~/dev/echo/subsystems/dungeon-walk/test/replay.test.ts` | P6 |
| Replay recorder tool | `~/dev/echo/subsystems/dungeon-walk/tools/record-traverse.ts` | P6 |
| FRICTION.md template | `~/dev/echo/subsystems/dungeon-walk/FRICTION.md` | P6 |
| Forge engine API surface | `~/dev/forge/docs/src/data/exports.ts` | every phase |
| Forge live docs | `https://f0rbit.github.io/forge/` | every phase |

---

## 14. Done criteria

Bestiary is **done** when:

- [ ] All four archetypes live in a single arena, distinguishably visible.
- [ ] Player walks; restart re-rolls; Tab toggles the debug overlay.
- [ ] `bun test` green: `replay.test.ts`, `chaser.test.ts`, `patroller.test.ts`, `ranged.test.ts`, `summoner.test.ts`, `astar.test.ts`.
- [ ] Two consecutive replay runs produce byte-identical world hashes.
- [ ] `f0rbit.github.io/echo/bestiary/` deploys, loads, and is interactive.
- [ ] `FRICTION.md` records every friction surfaced; promotable items flagged for v0.4.0 review.
- [ ] No code from any other subsystem is imported (echo's no-shared-package rule).
- [ ] No `Date.now`, `Math.random`, `setTimeout`, `setInterval` outside `__DEV__`-gated paths (forge's determinism contract — game code inherits).
