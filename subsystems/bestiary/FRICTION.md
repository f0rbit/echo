# bestiary — friction notes

## Status

Bestiary subsystem complete (v0.3.x against forge 0.3.0). All 4 archetypes + minions. Replay-deterministic. Live at https://f0rbit.github.io/echo/bestiary/.

Pain points hit while building this subsystem on `@f0rbit/forge` 0.3.0. Each entry is a candidate forge abstraction or a project convention worth recording. Order roughly by surface area / promotion strength.

> **Status (P6 first draft)**: live. v0.4.0 promotion candidates: A* (strong), `gfx_overlay` (strong), richer `__default__` atlas (medium). Game-side LOC at end of P6: ~700 source + ~480 tests.

## 1. A* is missing from forge — strong v0.4.0 candidate

Bestiary's `src/astar.ts` is a pure function over `Grid` + `passable` predicate (~80 LOC including a small binary heap). Used by chaser, patroller, ranged kiting, and minion pursuit. The shape matches forge's existing `Grid` methods (`g.line`, `g.line_of_sight`, `g.move_tile`).

Promoted shape:
```ts
g.astar(from, to, { passable, max_steps?, neighbors?: "4" | "8" })
  : readonly Cell[] | null
```

Determinism is load-bearing — tie-break by `key(cell)` so replay hashes stay stable. Bestiary's local copy passes 8 unit tests including the 8-neighbor variant. Phase 8 alignment review will decide.

**Status**: candidate (v0.4.0). When promoted, bestiary's `astar.ts` becomes a 1-line re-export.

## 2. `gfx_overlay` pattern — strong v0.4.0 candidate

Bestiary built two render-stage overlays in P4 and P6:

- `telegraph-render.ts` — Container + Graphics, draw red lines from telegraph_c entities, rect for projectile_c
- `debug-overlay.ts` — Container + Graphics + pooled Text labels, gated on `debug_visible_r`

Plus dungeon-walk's `win_overlay` (P5 of that subsystem) — Container + Text, toggled by a resource.

Three consumers, all the same shape: factory takes a parent Container and returns a `System` that runs every render-stage tick, calls `gfx.clear()` at the top, then draws. The boilerplate is:
- create Graphics + zIndex
- attach to parent (must be `app.render.world` for world-coords; `app.app.stage` for screen-coords)
- on each tick: clear, draw

Promoted shape:
```ts
const overlay = forge.gfx_overlay(parent, { z?: number })
overlay.draw((gfx, w, ctx) => { /* user draws into gfx */ })
// returns a System; clear-on-each-tick handled internally
```

Could also bundle a Text-pool helper (debug-overlay's `acquire_label` / `reset_labels` shape — re-use Text instances tick-to-tick instead of allocating).

**Status**: candidate (v0.4.0). Bestiary's `telegraph-render` and `debug-overlay` are 2 use-cases; dungeon-walk's `win-overlay` was the precursor.

## 3. Cell-occupancy check requires excluding `floor_c`

"Is this cell occupied by an entity?" is a recurring AI question (summoner spawn placement, multi-mover blocking, future arena pathing-around-allies). Floors carry `pos_c` so a naive `query([pos_c])` includes them, producing "every cell is occupied".

Bestiary's `summoner.ts` walks every `pos_c` entity and explicitly skips `floor_c`:
```ts
for (const [id, p] of w.query([pos_c] as const).collect()) {
  if (w.has(id, floor_c)) continue;
  // ...
}
```

Three options for the long-term shape:
- (a) Project convention: documented in AGENTS.md (current).
- (b) `query` opt: `world.query([pos_c], { without: [floor_c] })` already exists — use it.
- (c) Forge ships a typed `mover_c` marker convention; floors deliberately omit it.

(b) is cheapest and works today. Bestiary's `summoner_spawn_system` should switch to `world.query([pos_c], { without: [floor_c] })` for clarity — flagged for a polish pass.

**Status**: project convention; document in AGENTS.md.

## 4. World-container Graphics need explicit zIndex

PIXI sprite tiles render on `app.render.world` at the default zIndex (0). Overlays added to the same container must set `gfx.zIndex = 1000+` to render above tiles. Bestiary's `telegraph-render` (zIndex 1000) and `debug-overlay` (zIndex 1100 + 1101 for labels) both hit this.

If the parent Container doesn't have `sortableChildren = true`, the zIndex is ignored. forge's `app.render.world` already enables sortableChildren (verified: telegraph + debug overlays render correctly).

**Status**: AGENTS.md note. Pattern: "overlays on `app.render.world` must set `gfx.zIndex = 1000+`."

## 5. `world.spawn` during a system tick is safe

The summoner system spawns minions inside its iteration loop. No re-entrancy issues observed across 600 ticks of replay + 28 unit tests. forge's `query.collect()` snapshots the keyset before iteration so structural mutation during loop body is fine.

**Status**: confirmed pattern, no friction.

## 6. Pixi sprite tinting is multiplicative per-channel — limits placeholder palette

The `__default__` atlas has 4 frames (magenta, cyan, yellow, black). Tinting is RGB-multiplicative per channel: a yellow base `(1, 1, 0)` tinted with `0x4444ff` → `(0.27, 0.27, 0)` — produces a darkened yellow, NOT blue/purple. The blue channel is multiplied by zero.

Bestiary's archetype tinting (chaser red, patroller orange, ranged green, summoner purple, minion small-yellow) all picked frames where the desired tint shifted within a single channel. Summoner "purple" (`0x8800ff`) on yellow becomes a dim red — visually distinct from the others, which is enough for the 4-archetype demo, but it's not actually purple.

For a richer palette, ship a `__default__` atlas with more varied base colors (e.g., greyscale or a small color wheel) so any tint multiplied against any frame produces visually distinct output.

**Status**: candidate (v0.4.0, medium). Promote a richer `__default__` atlas — 8 frames (greyscale gradient + a few primaries) buys much more tinting headroom for placeholder art.

## 7. Per-entity FSM helper — game-side per planner verdict

`src/fsm.ts` is 10 LOC: `{ state, tick_entered }` + `enter()` + `since()`. Used by the patroller (3 states: patrolling/pursuing/returning). Chaser uses an inline `state_c.kind` discriminated union (idle/chasing). Ranged uses telegraph_c presence + cooldowns. Summoner uses `summoner_state_c.next_spawn_tick`.

Three archetypes, three different FSM shapes. Promotion only justified once two more subsystems share the same per-entity FSM shape (boss, future arena waves).

**Status**: hold game-side. Revisit in v0.5.0 if 2+ subsystems need it.

## 8. Marker-elision tuple position is easy to mis-index

forge v0.3.0's `query` auto-elides `Component<true>` markers from yielded tuples. So `query([data_c, marker_c, more_data_c])` returns `[id, data, more_data]`, not `[id, data, true, more_data]`.

Bestiary's `summoner.ts` queries `[pos_c, summoner_state_c, summoner_c]` and destructures `[id, p, st]` — three slots from three components after elision. Easy to get wrong if you mentally count the marker. The TypeScript types catch the mistake at compile time, but the error message reads as "Property 'x' does not exist on type 'true'" only if the marker is in a non-final position.

**Status**: AGENTS.md note. Convention: place markers last in `query` arrays for clarity, even though elision works regardless of position.

## 9. `replay.record(input, ctx, opts)` — `opts.seed` is not optional in practice

The recorder's two-arg overload `replay.record(input, ctx, { seed })` requires the seed at construction time even though the harness already knows it. Without `{ seed }`, the saved replay's `seed` field is undefined at JSON-serialize time and `replay.load` rejects. Minor friction; documented in dungeon-walk's `record-traverse.ts` and bestiary's `record-arena.ts`.

**Status**: AGENTS.md note for tool-writers. Could ship as a `replay.record(input, ctx)` short form if `harness` exposed its seed (it does — see `h.ctx.rng.seed`). One-line forge polish.

## 10. `world.clear()` is the right hammer for restart

forge v0.1.6's public `world.clear()` did exactly what restart needs: despawn every entity, reset stores, leave resources alone. Bestiary's `restart_system` is 5 LOC:

```ts
if (!ctx.input.just("restart")) return;
w.clear();
if (ctx.res.has(arena_r)) ctx.res.remove(arena_r);
regenerate_arena(w, ctx);
```

Compared to dungeon-walk's `despawn_marked(...markers)` approach — `world.clear()` is shorter, doesn't drift if new marker components are added, and is the documented pattern for hard restarts. Both work; bestiary picked `world.clear()` because there are 7+ marker components to enumerate.

**Status**: confirmed pattern, no friction. AGENTS.md note: "use `world.clear()` for full hard restarts; `despawn_marked(...)` for selective clears."

---

## v0.4.0 promotion candidates summary

| # | Candidate | Strength | Reasoning |
|---|---|---|---|
| 1 | `g.astar(from, to, opts)` | **Strong** | Every game with grid AI needs it; shape matches existing `Grid` methods; deterministic tie-break is load-bearing |
| 2 | `forge.gfx_overlay(parent, opts)` | **Strong** | 3 consumers across 2 subsystems; same boilerplate (Container + Graphics + zIndex + clear-on-tick); could include a Text-pool helper |
| 6 | Richer `__default__` atlas | Medium | Current 4-frame atlas limits tinting headroom; 8-frame greyscale + primaries unblocks more visual variety in placeholder art |
| 7 | Per-entity FSM helper | Hold | Need 2+ subsystems sharing the same shape; today bestiary has 3 different shapes |
| 9 | `replay.record(input, ctx)` short form | Low | One-liner polish; not blocking |
