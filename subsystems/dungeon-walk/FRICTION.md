# dungeon-walk — friction notes

Pain points hit while building this subsystem on `@f0rbit/forge` 0.1.5. Each entry is a candidate forge v0.2.0 abstraction. Order roughly by surface area / pain.

## 1. Grid math has to be hand-rolled

Every grid game needs `cell_to_world`, `world_to_cell`, `key(x, y)`, `unkey(k)`, `in_bounds`, `neighbors`, `chebyshev`. Plus the cols/rows/tile-size constants those functions close over. We wrote 30 LOC of pure utility (`src/grid.ts`) before any game-specific code existed. Bestiary will need the same. Astar will want `manhattan` and `cardinal_neighbors`. **Forge wants:** `forge.grid({ cols, rows, tile })` returning the helper bundle, plus a `Cell = { x: number; y: number }` shared type.

## 2. Periodic systems require manual gating

Tile-step movement at "every 6 ticks" forced this in every periodic system:

```ts
if (ctx.time.tick % step_every !== 0) return;
```

It's small but it scatters timing knowledge across systems. Bestiary's projectiles, summoners, and ranged-cooldowns will replicate this. **Forge wants:** `schedule.add_periodic("update", system, { every: 6 })` baking the gate into the schedule.

## 3. Spatial index by cell is game-side

For FOV we needed `Map<cellKey, entityId>` to look up "the floor entity at cell (x,y)". Built it inline at spawn time (~10 LOC inside `dungeon-gen.ts`) and stuffed it into a resource. Maintaining it on despawn is left as an exercise — fine for a static dungeon, broken the moment entities move between cells. **Forge wants:** `forge.grid_index(component, pos_component)` returning a live `{ at(cell): Id | null, around(cell, r): Id[] }` view that auto-updates on spawn/despawn/pos change.

## 4. Cellular visibility maps awkwardly to sprites

We mutate `sprite_c.visible` per tile every step. Each iteration: `get` the sprite, spread the data, `set` it back with new `visible`. ~6 LOC × 2 components = 12 LOC of churn just to toggle visibility. The `sprite_c.set` round-trip allocates a new object every tile, every step. With 800+ floor tiles that's measurable garbage. **Forge wants:** either (a) a cheap `sprite_c.visible_set(id, bool)` mutator that doesn't require a full data round-trip, or (b) a `visible_c` component that the sprite system honours via boolean check, or (c) a `forge.layer_mask` that tags entire collections of entities visible/hidden at once.

## 5. Mass-spawn is allocation-heavy

Generating ~200–800 floor entities at startup means 800 `w.spawn(...)` calls each allocating a few component-store slots. Build is fast (~few ms in the harness), but the `Map<cellKey, Id>` we maintain alongside is doing the same work as forge's internal stores in parallel. **Forge wants:** a `w.spawn_many(specs)` bulk path, and an internal `spatial_view` so the parallel index isn't necessary. (See #3.)

## 6. Component-tuple destructuring order is brittle

`w.query([pos_c, player_c, dir_c])` types the iterator as `[Id, Pos, true, Dir]`. Forgetting the marker-component slot (player_c is a `true` zero-data marker) caused four type errors that read as "Property 'dx' does not exist on type 'true'". Easy to fix once you know, but the error doesn't point at the destructure pattern. **Forge wants:** either a `marker_c` variant that's elided from the tuple type, or a `query.with(marker_c).get([pos_c, dir_c])` shape that separates filters from data fetches.

## 7. Resource-typed Map vs. live Map

Storing `floor_at: Map<number, Id>` in a resource works, but the resource type wants `ReadonlyMap` for safe consumption. The dungeon-gen system mutates the Map after construction (during the FOV index build) — that means the resource type lies about mutability for a brief window. Tolerable but ugly. **Forge wants:** a clearer pattern for "build it once, then publish it readonly" — perhaps `res.set_frozen(k, value)` or a `res.builder<T>(k)` API.

## 8. `tools/` Bun TS path aliases need explicit pull-in

The recorder script uses `@dw/resources.ts` once. Bun's runtime resolves it via tsconfig paths, but only after I added `tools/**/*` to tsconfig's `include`. A subtle gotcha — newcomers will spend five minutes wondering why their tool can't import. **Not a forge issue**, just a doc note for echo's per-subsystem template.

## 9. Pages workflow expects index.html at subsystem root

`.github/workflows/pages.yml` does `cp "$d/index.html" "_site/$name/index.html"` then `cp -r "$d/dist/." "_site/$name/dist/"`. The user's spec says ship a self-contained `dist/` (with index.html inside) referencing `./main.js`. Those two are inconsistent: deployed `_site/<name>/index.html` references `./main.js` but `main.js` lives at `_site/<name>/dist/main.js`. The build script copies `index.html` into `dist/` (per spec), AND a copy stays at the subsystem root for the workflow to pick up. **Either** the workflow should copy `dist/.` flat (matching spec), **or** the root `index.html` should reference `./dist/main.js`. The fix belongs in echo's pages.yml (out of scope for this run — flagged for the verifier).

## 10. `presets.movement2d` axis-only — no edge actions

The preset gives `move.x` / `move.y` axes but no `just_pressed` digital actions for tile-step "press once → step once" semantics. The spec said "hold-to-step is fine" so we treated the axis as a continuous direction, but a true tile-stepper wants edge-triggered movement (one press = one cell). Workaround: read the axis sign, gate movement on the periodic timer. Works, but loses the snappy "tap = single step" feel. **Forge wants:** `presets.tile_movement` that exposes `move.left`/`move.right`/`move.up`/`move.down` as digital edges, and pairs nicely with `add_periodic`.
