# dungeon-walk — friction notes

Pain points hit while building this subsystem on `@f0rbit/forge` 0.1.5. Each entry was a candidate forge abstraction. Order roughly by surface area / pain.

> **Status (post-v0.3.0)**: every promotable entry has been resolved across v0.2.0 (additive primitives) and v0.3.0 (interface cleanup). This doc is historical. Cumulative LOC reduction in `subsystems/dungeon-walk/src/**/*.ts`: **465 → 322 (-143)**. v0.2.0 took it from 465 → 357 (-108); v0.3.0 took it from 357 → 322 (-35) on top.

## 1. Grid math has to be hand-rolled

Every grid game needs `cell_to_world`, `world_to_cell`, `key(x, y)`, `unkey(k)`, `in_bounds`, `neighbors`, `chebyshev`. Plus the cols/rows/tile-size constants those functions close over. We wrote 30 LOC of pure utility (`src/grid.ts`) before any game-specific code existed. Bestiary will need the same. Astar will want `manhattan` and `cardinal_neighbors`. **Forge wants:** `forge.grid({ cols, rows, tile })` returning the helper bundle, plus a `Cell = { x: number; y: number }` shared type.

**RESOLVED in forge v0.2.0** — `@f0rbit/forge/grid` exports `grid({ cols, rows, tile })` returning the full helper bundle; `src/grid.ts` collapsed from 33 LOC to 3.

**Cleaned up in forge v0.3.0** — `line`, `line_of_sight`, `move_tile` are now `Grid` methods (`g.line`, `g.line_of_sight`, `g.move_tile`). The `grid: g` opts slot is gone; `move_tile` defaults `pos` to forge's canonical `pos_c`. dungeon-walk's `fov.ts` and `movement.ts` lose one import each.

## 2. Periodic systems require manual gating

Tile-step movement at "every 6 ticks" forced this in every periodic system:

```ts
if (ctx.time.tick % step_every !== 0) return;
```

It's small but it scatters timing knowledge across systems. Bestiary's projectiles, summoners, and ranged-cooldowns will replicate this. **Forge wants:** `schedule.add_periodic("update", system, { every: 6 })` baking the gate into the schedule.

**RESOLVED in forge v0.2.0** — `schedule.add_periodic(stage, sys, { every, phase? })` ships in core; the manual `tick % step !== 0` gate is gone from `movement_system`.

**Cleaned up in forge v0.3.0** — `add_periodic` is gone; `schedule.add(stage, sys, { every, phase?, name? })` is the unified shape. `plugin.ts` swaps one symbol for one opts bag.

## 3. Spatial index by cell is game-side

For FOV we needed `Map<cellKey, entityId>` to look up "the floor entity at cell (x,y)". Built it inline at spawn time (~10 LOC inside `dungeon-gen.ts`) and stuffed it into a resource. Maintaining it on despawn is left as an exercise — fine for a static dungeon, broken the moment entities move between cells. **Forge wants:** `forge.grid_index(component, pos_component)` returning a live `{ at(cell): Id | null, around(cell, r): Id[] }` view that auto-updates on spawn/despawn/pos change.

**RESOLVED in forge v0.2.0** — `grid_index()` + `grid_index_sync_system` ship on `@f0rbit/forge/grid`. dungeon-walk's migration drops the `cell_index_r` resource entirely; `fov_system` queries floor entities directly and computes cell keys per tick. (We didn't need the pre-built index in the end — the ad-hoc query path was simpler than wiring the sync system.)

## 4. Cellular visibility maps awkwardly to sprites

We mutate `sprite_c.visible` per tile every step. Each iteration: `get` the sprite, spread the data, `set` it back with new `visible`. ~6 LOC × 2 components = 12 LOC of churn just to toggle visibility. The `sprite_c.set` round-trip allocates a new object every tile, every step. With 800+ floor tiles that's measurable garbage. **Forge wants:** either (a) a cheap `sprite_c.visible_set(id, bool)` mutator that doesn't require a full data round-trip, or (b) a `visible_c` component that the sprite system honours via boolean check, or (c) a `forge.layer_mask` that tags entire collections of entities visible/hidden at once.

**Stays game-side** per planner verdict (option c — delta-tracking in the consumer). The post-v0.3.0 fov system uses `sprite.set(w, id, { visible })` (no `node`-spread round-trip) — the per-tile cost is now a single helper call without manual `{ ...sd.value, ... }` allocation, but the full sweep remains. Revisit if perf becomes an issue or a second consumer hits the same shape.

## 5. Mass-spawn is allocation-heavy

Generating ~200–800 floor entities at startup means 800 `w.spawn(...)` calls each allocating a few component-store slots. Build is fast (~few ms in the harness), but the `Map<cellKey, Id>` we maintain alongside is doing the same work as forge's internal stores in parallel. **Forge wants:** a `w.spawn_many(specs)` bulk path, and an internal `spatial_view` so the parallel index isn't necessary. (See #3.)

**RESOLVED in forge v0.2.0** — `world.spawn_many(count, factory)` + `world.despawn_marked(...markers)` ship in core. dungeon-walk's `build_dungeon` and `restart_system` use them. The parallel `floor_at` Map was deleted entirely.

**Cleaned up in forge v0.3.0** — `spawn_many` now also accepts an array of specs (`spawn_many([...specs])`), eliminating the cargo-culted `floor_keys.length` + index-lookup factory. `dungeon-gen.ts` reads `[...floors].map(k => …)` directly.

## 6. Component-tuple destructuring order is brittle

`w.query([pos_c, player_c, dir_c])` types the iterator as `[Id, Pos, true, Dir]`. Forgetting the marker-component slot (player_c is a `true` zero-data marker) caused four type errors that read as "Property 'dx' does not exist on type 'true'". Easy to fix once you know, but the error doesn't point at the destructure pattern. **Forge wants:** either a `marker_c` variant that's elided from the tuple type, or a `query.with(marker_c).get([pos_c, dir_c])` shape that separates filters from data fetches.

**RESOLVED in forge v0.2.0** — `world.query_data(data, markers)` ships in core; markers are dropped from the yielded tuple.

**Cleaned up in forge v0.3.0** — `query_data` is gone. `world.query` itself auto-elides `Component<true>` markers from the tuple, so there's only one query API. dungeon-walk's systems now use `w.query([pos_c, floor_c] as const)` (one array, not two) — same yielded shape, half the ceremony. The `as const` discipline is unchanged.

## 7. Resource-typed Map vs. live Map

Storing `floor_at: Map<number, Id>` in a resource works, but the resource type wants `ReadonlyMap` for safe consumption. The dungeon-gen system mutates the Map after construction (during the FOV index build) — that means the resource type lies about mutability for a brief window. Tolerable but ugly. **Forge wants:** a clearer pattern for "build it once, then publish it readonly" — perhaps `res.set_frozen(k, value)` or a `res.builder<T>(k)` API.

**Stays game-side** — planner deferred. Moot in v0.2.0 anyway: the parallel index was deleted (see §3), so the cell-keyed map is gone entirely.

## 8. `tools/` Bun TS path aliases need explicit pull-in

The recorder script uses `@dw/resources.ts` once. Bun's runtime resolves it via tsconfig paths, but only after I added `tools/**/*` to tsconfig's `include`. A subtle gotcha — newcomers will spend five minutes wondering why their tool can't import. **Not a forge issue**, just a doc note for echo's per-subsystem template.

**Already resolved** — the include is in `tsconfig.json`. Echo template note still pending.

## 9. Pages workflow expects index.html at subsystem root

`.github/workflows/pages.yml` does `cp "$d/index.html" "_site/$name/index.html"` then `cp -r "$d/dist/." "_site/$name/dist/"`. The user's spec says ship a self-contained `dist/` (with index.html inside) referencing `./main.js`. Those two are inconsistent: deployed `_site/<name>/index.html` references `./main.js` but `main.js` lives at `_site/<name>/dist/main.js`. The build script copies `index.html` into `dist/` (per spec), AND a copy stays at the subsystem root for the workflow to pick up. **Either** the workflow should copy `dist/.` flat (matching spec), **or** the root `index.html` should reference `./dist/main.js`. The fix belongs in echo's pages.yml (out of scope for this run — flagged for the verifier).

**Already resolved upstream** — out of scope for forge.

## 10. LOS-aware FOV is hand-rolled

Dungeon-walk's FOV started as a Chebyshev radius (`chebyshev(p, c) <= r`), which "sees through" walls — a cell behind a blocker lit up just because it was within range. First attempt: 8-octant recursive shadowcast (RogueBasin-style). Looked elegant on paper but had a real asymmetry bug — slope thresholds `(dx ± 0.5) / (dy ± 0.5)` interact differently across octants for cells exactly on octant diagonals, producing visible cells from one direction that vanish from the mirrored direction. Replaced with a **symmetric Bresenham-line raycast** (~50 LOC, `src/fov-calc.ts`): for every cell within Chebyshev radius, walk a Bresenham line from player to target and require every intermediate step to be a floor. Symmetric by construction (`line(A,B) === reverse(line(B,A))`), trivial to test, and reuses the same line iterator that bestiary's enemy aim/fire-line checks will need. Algorithm is reusable shape — bestiary's enemy AI sight cones, boss-arena reveal triggers, stealth detection. **Forge wants:** `forge.fov.line_of_sight({ from, radius, is_blocking })` returning `Set<cellKey>`, built on top of `forge.line` (see #11). Promote when bestiary surfaces the same need.

**RESOLVED in forge v0.2.0** — `line_of_sight({ from, radius, grid, is_blocking })` ships on `@f0rbit/forge/grid`. `src/fov-calc.ts` (58 LOC) deleted; `fov_system` calls forge's `line_of_sight` directly.

## 11. Bresenham line iteration

Now used by `fov-calc.ts` directly — every visible-cells query Bresenhams from player to target. Sibling uses (raycasting for hit-line predictions, line-of-fire checks, line drawing for path previews) are the obvious second wave once enemies need ranged-attack telegraphs. **Forge wants:** `forge.line(a, b)` as a generator yielding cells. ~20 LOC. **Promoted from candidate to confirmed duplication target** — used by FOV (#10) AND the imminent ranged-attack work in bestiary; the same Bresenham step-walk shows up in two places already in dungeon-walk if we count `fov-calc.ts` and any future projectile system.

**RESOLVED in forge v0.2.0** — `line(a, b)` generator ships on `@f0rbit/forge/grid` (used internally by `line_of_sight`).

## 12. Movement-with-collision pattern

Every tile game writes the same loop: read direction, compute candidate target cell(s), check passability, maybe move. Bestiary's enemy stepping will be identical with a different `is_blocked` predicate. The current dungeon-walk version (`src/systems/movement.ts`) is also doing axis-by-axis sliding (try X then Y from the resulting cell) to forbid corner-cutting through diagonal walls — a subtle correctness detail every tile-stepper needs. **Forge wants:** `forge.move_tile(world, entity, dir, { blocked_by: (cell) => bool })` baking in the slide semantics. ~15 LOC. Candidate, see if bestiary surfaces same need.

**RESOLVED in forge v0.2.0** — `move_tile(w, id, pos_c, grid, dir, { blocked_by, slide? })` ships on `@f0rbit/forge/grid` and returns `Result<{ from, to, moved }>`. `movement_system` body collapsed from ~25 LOC of axis-step plumbing to one call.

## 13. `presets.movement2d` axis-only — no edge actions

The preset gives `move.x` / `move.y` axes but no `just_pressed` digital actions for tile-step "press once → step once" semantics. The spec said "hold-to-step is fine" so we treated the axis as a continuous direction, but a true tile-stepper wants edge-triggered movement (one press = one cell). Workaround: read the axis sign, gate movement on the periodic timer. Works, but loses the snappy "tap = single step" feel. **Forge wants:** `presets.tile_movement` that exposes `move.left`/`move.right`/`move.up`/`move.down` as digital edges, and pairs nicely with `add_periodic`.

**RESOLVED in forge v0.2.0** — `presets.movement_4way_digital` ships discrete 4-way bindings (no axes, deadzone 0).

**Cleaned up in forge v0.3.0** — preset names now consistently snake_case: `movement2d → movement_2d`, `movement8way → movement_8way`, `movement_4way_digital → movement_4way` (the `_digital` suffix dropped since 4-way is digital by default). dungeon-walk's `bindings.ts` updates one symbol. Still on `movement_2d` for replay continuity.

## 14. End-state overlay UI is game-side

Win/lose/paused/level-complete screens are a primitive every demo needs. Today (`src/main.ts` + `src/plugin.ts`) we hand-rolled the pattern: a PIXI `Text` attached to `app.app.stage` plus a `WinOverlay` resource exposing `show(visible)` so a render-stage system can toggle it based on game state. Roughly 25 LOC of glue. `ctx.debug.text(...)` is unsuitable because it's `__DEV__`-gated and disappears in production — the previous implementation hit exactly this. Bestiary will need "you died", boss-arena will need "victory", platformer will need "level complete". **Forge wants:** `forge.text_overlay(stage, { text, position, anchor, style })` returning `{ show, hide, set_text }` — a tiny wrapper that creates a styled PIXI Text, attaches it to the stage's overlay layer (sibling of the world surface, beneath the debug overlay), and hands back a small handle. Candidate, not yet a duplication.

**Stays game-side** per planner verdict — too few data points to lock styling defaults. Cookbook recipe documents the dungeon-walk pattern.

## 15. `sprite_c` has no scale field — atlas frame size dictates grid tile size

Forge's `__default__` atlas frames are 16x16 (`~/dev/forge/src/pixi/assets.ts:111-114`). `sprite_c.SpriteData` exposes `texture, frame, anchor, tint, visible, z, node` — no `width`, `height`, or `scale`. When a tile-based subsystem picks a tile size that doesn't match the atlas frame size (e.g. dungeon-walk originally used `tile = 8`), every floor sprite renders 16px wide at the 8px cell, bleeding 8px into each adjacent cell. Visually: floor sprites cover wall positions in solid cyan instead of the canvas-bg black, killing the "tile grid" read entirely. The only available fix today is to bump tile size to match atlas frame size (what dungeon-walk now does — `tile = 16`, grid 20x11 instead of 40x22). That works but constrains every grid-based subsystem to multiples of 16, even when the design grid would be cleaner at a different resolution. **Forge wants:** a `scale?: { x: number; y: number }` field on `SpriteData`; `sprite_sync_system` applies `node.scale.set(sd.scale.x, sd.scale.y)` after texture assignment. ~5 LOC. **Confirmed need** — dungeon-walk is the first concrete instance; every future tile-based subsystem with a custom atlas hits this.

**RESOLVED in forge v0.2.0** — `SpriteData.scale?: { x, y }` (in `/pixi`); `sprite_sync_system` applies it. dungeon-walk doesn't need it (still happily on `tile = 16`), but the option is there for any subsystem that wants a non-16 grid.

**Cleaned up in forge v0.3.0** — `SpriteData.node` is gone from the public type; runtime PIXI Sprite refs live in a private `WeakMap<World, Map<Id, Sprite>>`. New helpers `sprite.set(w, id, partial)`, `sprite.show(w, id)`, `sprite.hide(w, id)` replace the spread-and-set ceremony for partial updates. dungeon-walk's `set_visible` helper (~6 LOC) is gone — `fov_system` calls `sprite.set(w, id, { visible })` directly.

## 16. `step_every` calibration is implicitly coupled to `grid.tile`

Tile-step movement gates on `ctx.time.tick % step_every === 0`. The perceived screen-speed is `tile / (step_every * fixed_dt)` px/sec — which means changing `tile` (16 → 32, or 16 → 8) silently doubles or halves the player's apparent travel rate, even though `step_every` was unchanged. We hit this on the v0.1.x → 16px tile bump in #15: movement looked "blinky" because we'd doubled the per-step world-distance without retuning the tick gate. Had to recalibrate `step_every` from 6 → 10 to restore the intended ~6 steps/sec feel. **Reinforces #2 + #12:** a `forge.move_tile(world, entity, dir, { every_ticks })` helper would make the timing explicit at the call site instead of as a magic constant on the system module. Even better, `every_ticks` could derive from a target `cells_per_second` config, decoupling timing from tile size entirely.

**RESOLVED in forge v0.2.0** — `ticks_per_step(cells_per_second, fixed_dt)` ships on `@f0rbit/forge/grid`. `step_every` is now derived from `ticks_per_step(6, 1/60) === 10`. The magic constant is gone; speed is declared in cells/second.

## 17. `internal` symbol is duplicated across `@f0rbit/forge` and `@f0rbit/forge/pixi` entry points

Forge ships two entry points (`@f0rbit/forge` and `@f0rbit/forge/pixi`) that each declare `const internal = Symbol("forge.world.internal")` independently. The pixi entry has its own `world()` implementation that uses its own `internal` symbol as the internal-API key. When game code does `import { internal } from "@f0rbit/forge"` and then accesses `world[internal]` on a world constructed via `boot()` (pixi entry), `world[internal]` is `undefined` — calling `.clear()` on it throws `Cannot read properties of undefined`. The bug is silent in tests because the test harness uses the main entry's `world()`. We hit this on dungeon-walk's restart system: `w[internal].clear()` worked in tests but threw in the browser. Workaround: iterate marker components and `w.despawn(id)` each — works but ~8 LOC vs. one. **Forge wants:** either (a) a public `world.clear()` method on the World API so consumers never touch `internal`, or (b) collapse the two entry points to share a single source of truth for the internal symbol (re-export, not redeclare). Option (a) is the cleaner fix — the internal symbol is internal precisely because consumers shouldn't depend on it, but `clear()` is a legitimate game-side need (restart, level transitions, scene switches).

**Already resolved in forge v0.1.6** — `Symbol.for("forge.world.internal")` + public `world.clear()`. Restart now uses `world.despawn_marked(...)` per §5.
