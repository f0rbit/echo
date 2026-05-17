# Walls as Entities + Spatial Index + Autotile

Plan for converting implicit cell-key walls into real ECS entities with a derived spatial index, then rendering them via 4-bit bitmask autotile against the 0x72 tileset. Covers `subsystems/bestiary/` and `subsystems/dungeon-walk/`.

Decisions are locked (see prompt). This plan converts those decisions into a concrete, file-level execution script for `coder-fast` and `coder` agents.

---

## §1 Goals + non-goals

### Goals

1. Walls are first-class ECS entities — every cell that blocks movement has an entity with `[pos_c, wall_c]`.
2. A `wall_index_r` resource holds a `Set<number>` rebuilt each tick from `[pos_c, wall_c]` queries, providing O(1) `is_blocking(cell)` for AI, movement, lighting, and projectile systems.
3. The perimeter cells (x=0, x=cols-1, y=0, y=rows-1) become wall entities — eliminates the implicit "out-of-bounds is blocking" branch in `is_blocking` predicates.
4. Each wall renders a frame from the 0x72 `DungeonTilesetII_v1.7` atlas chosen by a 4-bit N|E|S|W neighbor bitmask, computed once at startup and cached on the entity via `sprite_c`.
5. Replays are re-recorded with the new world state. The new SHA-256 baseline hashes become the canonical truth.

### Non-goals

- Moving walls. Walls are static in v1. The autotile pass is one-shot at startup.
- Forge promotion. `spatial_index` and `autotile` stay subsystem-side. Future promotion candidates flagged in §10.
- Visual perfection. The 0x72 named pieces aren't designed for a strict 4-bit autotile — some patterns will approximate. Visual tuning happens in Phase 2.
- Dungeon-walk `floor_c` exit/door themed sprites. Sprite mapping for `exit_c` stays untouched.
- Refactoring lighting's `is_blocking` resolver into a shared module. We swap the predicate inline.

---

## §2 New component, resource, systems

### Component (per subsystem)

**Bestiary** — `subsystems/bestiary/src/components.ts`, add after `floor_c`:

```ts
export const wall_c: Component<true> = component<true>("bst.wall");
```

**Dungeon-walk** — `subsystems/dungeon-walk/src/components.ts`, add after `floor_c`:

```ts
export const wall_c: Component<true> = component<true>("dw.wall");
```

### Resource (per subsystem)

**Bestiary** — `subsystems/bestiary/src/resources.ts`:

```ts
export type WallIndex = { cells: ReadonlySet<number> };
export const wall_index_r: ResKey<WallIndex> = resource<WallIndex>("bst.wall_index");
```

Also remove `pillars: ReadonlySet<number>` from the `Arena` type and the `ctx.res.set(arena_r, ...)` call in `arena-gen.ts:94`.

**Dungeon-walk** — `subsystems/dungeon-walk/src/resources.ts`:

```ts
export type WallIndex = { cells: ReadonlySet<number> };
export const wall_index_r: ResKey<WallIndex> = resource<WallIndex>("dw.wall_index");
```

### `wall_index_system: System` (per subsystem)

New file `subsystems/<sub>/src/systems/wall-index.ts`:

```ts
import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { wall_c } from "../components.ts";
import { g } from "../grid.ts";
import { wall_index_r } from "../resources.ts";

export const wall_index_system: System = (w, ctx) => {
	const cells = new Set<number>();
	for (const [, p] of w.query([pos_c, wall_c] as const).collect()) {
		const c = g.world_to_cell(p.x, p.y);
		cells.add(g.key(c.x, c.y));
	}
	ctx.res.set(wall_index_r, { cells });
};
```

Schedule (per `plugin.ts`):

```ts
sch.add("pre", wall_index_system, "<prefix>.wall_index");
```

Must run before `creature_occupancy_system` (already on `"pre"`) is unnecessary, but MUST run before any `"update"` stage system that reads `wall_index_r`. The `"pre"` stage runs before `"update"` per forge's schedule order, so placement in `"pre"` is correct.

Bestiary call site: insert at `plugin.ts:43` between `restart_system` and `debug_toggle_system`.
Dungeon-walk call site: insert at `plugin.ts:27` between `restart_system` and `input_system`.

### `wall_autotile_system: System` (per subsystem)

New file `subsystems/<sub>/src/systems/wall-autotile.ts`. Pure ECS pass; runs in `"startup"` after world-gen.

```ts
import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { sprite_c } from "@f0rbit/forge/pixi";
import { wall_c } from "../components.ts";
import { g } from "../grid.ts";

const N = 1, E = 2, S = 4, W = 8;

const WALL_FRAME_BY_PATTERN: Readonly<Record<number, string>> = {
	0:  "column_wall",
	1:  "wall_outer_front_left",
	2:  "wall_left",
	3:  "wall_edge_bottom_left",
	4:  "wall_top_mid",
	5:  "wall_edge_mid_left",
	6:  "wall_top_left",
	7:  "wall_edge_tshape_left",
	8:  "wall_right",
	9:  "wall_edge_bottom_right",
	10: "wall_mid",
	11: "wall_edge_tshape_bottom_left",
	12: "wall_top_right",
	13: "wall_edge_tshape_right",
	14: "wall_edge_tshape_bottom_right",
	15: "wall_mid",
};

export const wall_autotile_system: System = w => {
	const cells = new Set<number>();
	const entries: Array<[number, { x: number; y: number }, { cx: number; cy: number }]> = [];
	for (const [id, p] of w.query([pos_c, wall_c] as const).collect()) {
		const c = g.world_to_cell(p.x, p.y);
		const k = g.key(c.x, c.y);
		cells.add(k);
		entries.push([id, p, { cx: c.x, cy: c.y }]);
	}
	for (const [id, , { cx, cy }] of entries) {
		if (w.has(id, sprite_c)) continue;
		let mask = 0;
		if (cells.has(g.key(cx, cy - 1))) mask |= N;
		if (cells.has(g.key(cx + 1, cy))) mask |= E;
		if (cells.has(g.key(cx, cy + 1))) mask |= S;
		if (cells.has(g.key(cx - 1, cy))) mask |= W;
		const frame = WALL_FRAME_BY_PATTERN[mask] ?? "wall_mid";
		w.set(id, sprite_c, {
			texture: "dungeon",
			frame,
			anchor: { x: 0.5, y: 0.5 },
			visible: true,
		});
	}
};
```

Scheduling: this is `"startup"`, but the sprite-attach system that handles other markers is on `"post"`. Two options — pick option A:

- **Option A (chosen)**: Run `wall_autotile_system` on `"startup"` AFTER `arena_gen_system` / `dungeon_gen_system`. Walls get their sprite immediately; the normal `sprite_attach_system` on `"post"` simply skips them because of the `w.has(id, sprite_c)` guard already present (`sprite-attach.ts:35`, `sprite-attach.ts:23`).

Bestiary: `plugin.ts:41` becomes:

```ts
sch.add("startup", arena_gen_system, "bst.gen");
sch.add("startup", wall_autotile_system, "bst.wall_autotile");
```

Dungeon-walk: `plugin.ts:26` becomes:

```ts
sch.add("startup", dungeon_gen_system, "dw.gen");
sch.add("startup", wall_autotile_system, "dw.wall_autotile");
```

Order matters — `wall_autotile_system` registers AFTER world-gen so it runs second within the startup stage.

For restart support: after `w.clear()` (bestiary) or `despawn_marked` (dungeon-walk), the autotile pass needs to run again. See §5 for restart handling.

---

## §3 Predicate-swap call sites (exhaustive)

Every site that derives `is_blocking` or `passable` from `floors` switches to `wall_index_r`. The semantics flip: `floors.has(k)` (true = walkable) becomes `!wall_index.has(k)` (true = walkable since absence-of-wall = floor). Out-of-bounds cells are no longer special-cased because the perimeter is now wall entities.

### Bestiary

| File | Lines | Change |
|---|---|---|
| `src/systems/movement.ts` | 9–19 | Replace `arena.value.floors` with `ctx.res.get(wall_index_r)`. `blocked_by` becomes `(c) => wall_index.cells.has(g.key(c.x, c.y))` |
| `src/systems/ai/chaser.ts` | 10–32 | Same swap. `is_blocking = (c) => wall_index.cells.has(g.key(c.x, c.y))`. `passable` checks `!wall_index.cells.has(k)` instead of `floors.has(k)` |
| `src/systems/ai/patroller.ts` | 22–46 | Same |
| `src/systems/ai/ranged.ts` | 37–67, 120–138 | Same — both think system AND `projectile_step_system` |
| `src/systems/ai/path-step.ts` | 10–43 | Replace `floors` lookups with `wall_index` lookups |
| `src/systems/ai/summoner.ts` | 26–41 | `floors.has(k)` → `!wall_index.cells.has(k)`. Summoner already iterates `w.query([pos_c])` to build its own occupancy set — leave that intact, only swap the floor check |
| `src/plugin.ts` | 67–72 | `make_light_update_system` resolver: `return cell => wall_index.cells.has(g.key(cell.x, cell.y))` |

Pattern: each system that currently does `const { floors } = arena.value;` switches to:

```ts
const wi = ctx.res.get(wall_index_r);
if (!wi.ok) return;
const walls = wi.value.cells;
const is_blocking = (c: Cell): boolean => walls.has(g.key(c.x, c.y));
```

The `arena_r` resource is still needed for `spawn` + `cols/rows` etc. — don't delete the `ctx.res.get(arena_r)` call, only stop reading `.floors`/`.pillars` off it.

### Dungeon-walk

| File | Lines | Change |
|---|---|---|
| `src/systems/movement.ts` | 9–24 | `dungeon_r.value.floors` → `wall_index_r.value.cells`; flip predicate. Keep `exit` lookup from `dungeon_r` |
| `src/plugin.ts` | 36–42 | Light resolver: `return cell => walls.has(g.key(cell.x, cell.y))` |

The `dungeon_r` resource keeps `floors` for the moment (see §9 decision 6). Tests that read `dungeon.floors.size` still pass.

---

## §4 Bitmask → frame lookup table

Pattern bits, given a wall cell at (cx, cy):

- `N = 1` if `(cx, cy-1)` is a wall
- `E = 2` if `(cx+1, cy)` is a wall
- `S = 4` if `(cx, cy+1)` is a wall
- `W = 8` if `(cx-1, cy)` is a wall

Initial mapping (lock as the v1 starting point; iterate visually in Phase 2):

| Mask | Bits NESW | Neighbors | Frame |
|---:|:---:|---|---|
| 0  | ---- | isolated | `column_wall` |
| 1  | N--- | tail with N neighbor only | `wall_outer_front_left` |
| 2  | -E-- | east-only stub (west end-cap) | `wall_left` |
| 3  | NE-- | bend opening SW | `wall_edge_bottom_left` |
| 4  | --S- | south-only stub (north end-cap) | `wall_top_mid` |
| 5  | N-S- | vertical run | `wall_edge_mid_left` |
| 6  | -ES- | bend opening NW | `wall_top_left` |
| 7  | NES- | T-junction opening W | `wall_edge_tshape_left` |
| 8  | ---W | west-only stub (east end-cap) | `wall_right` |
| 9  | N--W | bend opening SE | `wall_edge_bottom_right` |
| 10 | -E-W | horizontal run | `wall_mid` |
| 11 | NE-W | T-junction opening S | `wall_edge_tshape_bottom_left` |
| 12 | --SW | bend opening NE | `wall_top_right` |
| 13 | N-SW | T-junction opening E | `wall_edge_tshape_right` |
| 14 | -ESW | T-junction opening N | `wall_edge_tshape_bottom_right` |
| 15 | NESW | cross / interior | `wall_mid` |

`column_wall` is used for mask 0 (lone pillars). All other unmapped corners fall back to `wall_mid` (the default in the `?? "wall_mid"` guard).

These choices map by-eye to the 0x72 set; some will look wrong (e.g. mask 1's south-cap), and Phase 2 includes a tuning sub-task to refine after visual inspection. The map lives in `wall-autotile.ts` so a single edit changes all walls.

---

## §5 World-gen changes per subsystem

### Bestiary (`subsystems/bestiary/src/arena-gen.ts`)

Inside `build_arena()`:

1. Build the existing `interior_floor_keys()` set as-is (lines 56–62).
2. Run `place_pillars(floors, rng)` as-is — get the `pillars: Set<number>` (lines 64–88).
3. Compute `wall_cells: Set<number>` for all perimeter cells PLUS all `pillars`:

```ts
const wall_cells = new Set<number>();
// perimeter
for (let x = 0; x < g.cols; x++) {
	wall_cells.add(g.key(x, 0));
	wall_cells.add(g.key(x, g.rows - 1));
}
for (let y = 1; y < g.rows - 1; y++) {
	wall_cells.add(g.key(0, y));
	wall_cells.add(g.key(g.cols - 1, y));
}
// pillars
for (const k of pillars) wall_cells.add(k);
```

4. Set `arena_r` with the new shape — `floors` stays, `pillars` is removed:

```ts
ctx.res.set(arena_r, { cols: g.cols, rows: g.rows, floors, spawn: spawn_cell });
```

5. Spawn floor entities as today (lines 97–100, unchanged).
6. Spawn wall entities after floors:

```ts
const tile = g.tile;
w.spawn_many([...wall_cells].map(k => {
	const c = g.unkey(k);
	const p = g.cell_to_world(c.x, c.y);
	return [[pos_c, p], [wall_c, true]];
}));
```

Note: walls do NOT get `visual_pos_c` (decision 4 — they don't tween).

7. Update `Arena` type in `resources.ts`:

```ts
export type Arena = {
	cols: number;
	rows: number;
	floors: ReadonlySet<number>;
	spawn: Cell;
};
```

### Dungeon-walk (`subsystems/dungeon-walk/src/systems/dungeon-gen.ts`)

Inside `build_dungeon()`:

1. `generate(rng)` returns `floors` as today (line 81). 
2. Compute `wall_cells` as every cell NOT in `floors`:

```ts
const wall_cells = new Set<number>();
for (let y = 0; y < g.rows; y++) {
	for (let x = 0; x < g.cols; x++) {
		const k = g.key(x, y);
		if (!floors.has(k)) wall_cells.add(k);
	}
}
```

3. Existing `ctx.res.set(dungeon_r, …)` unchanged (line 83).
4. Existing floor and exit spawns unchanged (lines 87–92).
5. Spawn wall entities BEFORE the player spawn (so `restart` ordering is consistent):

```ts
w.spawn_many([...wall_cells].map(k => {
	const c = g.unkey(k);
	const p = g.cell_to_world(c.x, c.y);
	return [[pos_c, p], [wall_c, true]];
}));
```

6. Update dungeon-walk `restart_system` (`subsystems/dungeon-walk/src/systems/restart.ts`) to include `wall_c` in the despawn list:

```ts
for (const m of [floor_c, exit_c, player_c, wall_c]) w.despawn_marked(m);
```

Add the import for `wall_c`.

7. After `regenerate_dungeon` (and after `regenerate_arena`), the autotile pass needs to re-run because new walls have no sprites. Two ways:
   - Have `regenerate_*` call `wall_autotile_system(w, ctx)` directly at the end. Simple, works for both.
   - Or expose autotile as a function (e.g. `apply_autotile(w)`) and call it from both `wall_autotile_system` AND `regenerate_*`.

Pick option B: factor out a pure helper `apply_wall_autotile(w: World): void` inside `wall-autotile.ts`, and have `wall_autotile_system` wrap it. Then:
   - Bestiary `arena-gen.ts::regenerate_arena`: after `build_arena(w, ctx, …)`, call `apply_wall_autotile(w)`.
   - Dungeon-walk `dungeon-gen.ts::regenerate_dungeon`: after `build_dungeon(…)`, call `apply_wall_autotile(w)`.

This avoids needing a scheduling re-trigger for `"startup"` systems mid-run.

### Bestiary restart hook (`arena-gen.ts:162-168`)

`regenerate_arena` already calls `build_arena` which spawns the new wall entities. Add `apply_wall_autotile(w)` after `build_arena(w, ctx, make_rng(...))` on line 167.

### Dungeon-walk restart hook (`dungeon-gen.ts:108-114`)

Same — add `apply_wall_autotile(w)` after `build_dungeon(w, ctx, make_rng(...))` on line 113.

---

## §6 Phase 1 — Walls as entities (uniform placeholder sprite)

### Task 1.1 — Schema + components + resources (sequential, foundation)

**Files**: `subsystems/bestiary/src/components.ts`, `subsystems/bestiary/src/resources.ts`, `subsystems/dungeon-walk/src/components.ts`, `subsystems/dungeon-walk/src/resources.ts`.

**Changes**:
- Add `wall_c` component to each subsystem's `components.ts`.
- Add `WallIndex` type + `wall_index_r` resource to each `resources.ts`.
- Remove `pillars: ReadonlySet<number>` from bestiary's `Arena` type.

**LOC**: ~25 across 4 files. **Parallelisable**: no (foundation). **Agent**: `coder`.

### Task 1.2 — Wall-index system + plugin wiring (sequential after 1.1)

**Files**: new `subsystems/bestiary/src/systems/wall-index.ts`, new `subsystems/dungeon-walk/src/systems/wall-index.ts`, `subsystems/bestiary/src/plugin.ts`, `subsystems/dungeon-walk/src/plugin.ts`.

**Changes**:
- Implement `wall_index_system` per §2.
- Register on `"pre"` stage in each plugin between `restart_system` and the next pre-stage system.

**LOC**: ~50 across 4 files. **Parallelisable**: yes — the two subsystems can split (bestiary task 1.2a, dungeon-walk task 1.2b). **Agent**: `coder-fast` x 2 in worktrees.

### Task 1.3 — World-gen wall spawning (per §5)

**Files**: `subsystems/bestiary/src/arena-gen.ts`, `subsystems/dungeon-walk/src/systems/dungeon-gen.ts`.

**Changes**:
- Bestiary: build `wall_cells` from perimeter + pillars, spawn entities, drop `pillars` from `arena_r`.
- Dungeon-walk: build `wall_cells` from non-floor cells, spawn entities. Update `restart_system` to include `wall_c` in despawn list.

**LOC**: ~60 across 3 files. **Parallelisable**: yes — split by subsystem (1.3a bestiary, 1.3b dungeon-walk + restart). **Agent**: `coder-fast` x 2 in worktrees.

### Task 1.4 — Predicate swap (per §3)

**Files (bestiary)**: `src/systems/movement.ts`, `src/systems/ai/chaser.ts`, `src/systems/ai/patroller.ts`, `src/systems/ai/ranged.ts`, `src/systems/ai/path-step.ts`, `src/systems/ai/summoner.ts`, `src/plugin.ts` (light resolver).

**Files (dungeon-walk)**: `src/systems/movement.ts`, `src/plugin.ts` (light resolver).

**Changes**: each system swaps `floors.has(k)` → `!walls.has(k)` and `!floors.has(k)` → `walls.has(k)` per the mapping table. Adds `import { wall_index_r } from "../../resources.ts"` where missing.

**LOC**: ~80 across 9 files. **Parallelisable**: yes — split between two coder-fast worktrees:
- Worktree A: bestiary (7 files)
- Worktree B: dungeon-walk (2 files)

**Agent**: `coder-fast` x 2.

### Task 1.5 — Placeholder sprite mapping

**Files**: `subsystems/bestiary/src/systems/sprite-attach.ts`, `subsystems/dungeon-walk/src/systems/sprite-attach.ts`.

**Changes**: add an entry mapping `wall_c` to `{ texture: "dungeon", frame: "wall_mid", anchor: { x: 0.5, y: 0.5 }, visible: true }` so Phase 1 renders walls uniformly.

**LOC**: ~10 across 2 files. **Parallelisable**: yes (with 1.4). **Agent**: `coder-fast`.

### Task 1.6 — Replay re-record + baseline update

Run after 1.1–1.5 + verification compile passes.

**Steps**:
1. `cd subsystems/bestiary && bun run record:arena` — overwrites `replays/arena.replay.json` and prints the new world hash (test will fail until baseline updates).
2. Run `bun test` in bestiary to capture the new hash from the failing test output.
3. Update `subsystems/bestiary/test/replay.test.ts:23` — replace `expected_hash` with the new SHA-256.
4. `cd subsystems/dungeon-walk && bun run record` — re-records `replays/traverse.replay.json`. Dungeon-walk's `hash_world` (line 28) hashes entity count + floor count + reached state, so the new wall entities WILL change `n=` count. The test uses `hash_world` only for determinism (compares two runs of the SAME replay) — it never compares to a baseline literal. So no replay.test.ts edit needed for dungeon-walk.
5. Check `subsystems/dungeon-walk/test/restart.test.ts:88, 116, 119` — uses `dungeon.floors.size` and floors-set equality. `floors` is still set in `dungeon_r` so these should still pass.
6. Check `subsystems/bestiary/test/restart.test.ts` for any baselines that might change.

**LOC**: ~3 (hash literal). **Parallelisable**: no. **Agent**: `coder` (verification).

### Phase 1 verification

- `bun run typecheck` in both subsystems — clean.
- `bun run build` in both — clean.
- `bun test` from echo root — all green; new bestiary baseline hash committed.
- Visual: `bun run dev` in each subsystem; open via Chrome DevTools MCP; verify:
  - All cells that were previously floors-not-listed are now visibly walls.
  - Player cannot walk through any wall (including the outer perimeter).
  - Pillars in bestiary (5 randomly-placed) render as brick.
  - Light propagates correctly (no escape into the void at the perimeter).
  - Chaser/patroller/ranged enemies pathfind correctly around pillars.

### Phase 1 commit

Single atomic commit: `feat(walls): walls as entities with derived spatial index`

Body (template, per `git-workflow` skill):

```
- add wall_c marker component + wall_index_r resource (both subsystems)
- spawn perimeter + pillar entities in bestiary
- spawn non-floor wall entities in dungeon-walk
- swap is_blocking/passable predicates from floors to wall_index
- drop pillars set from arena_r (replaced by wall entities)
- re-record bestiary arena.replay.json; update baseline hash
- placeholder uniform wall_mid sprite (autotile in next phase)

BREAKING: bestiary Arena type no longer exposes pillars
BREAKING: bestiary replay baseline hash changes (new sim state)
```

---

## §7 Phase 2 — Autotile rendering

### Task 2.1 — Autotile system + helper

**Files**: new `subsystems/bestiary/src/systems/wall-autotile.ts`, new `subsystems/dungeon-walk/src/systems/wall-autotile.ts`.

**Changes**: implement per §2 (`wall_autotile_system` + `apply_wall_autotile` helper, plus exported `WALL_FRAME_BY_PATTERN`).

**LOC**: ~70 across 2 files. **Parallelisable**: yes (split by subsystem). **Agent**: `coder-fast` x 2 in worktrees.

### Task 2.2 — Plugin wiring + regenerate hooks

**Files**: `subsystems/bestiary/src/plugin.ts`, `subsystems/bestiary/src/arena-gen.ts`, `subsystems/dungeon-walk/src/plugin.ts`, `subsystems/dungeon-walk/src/systems/dungeon-gen.ts`.

**Changes**:
- Register `wall_autotile_system` on `"startup"` after world-gen in each plugin.
- Call `apply_wall_autotile(w)` at the end of `regenerate_arena` (bestiary) and `regenerate_dungeon` (dungeon-walk).
- Remove the `wall_c` entry from `sprite-attach.ts` added in Task 1.5 (autotile now owns wall sprites).

**LOC**: ~25 across 5 files. **Parallelisable**: yes (by subsystem). **Agent**: `coder-fast` x 2.

### Task 2.3 — Visual iteration on `WALL_FRAME_BY_PATTERN`

**Files**: `subsystems/bestiary/src/systems/wall-autotile.ts`, `subsystems/dungeon-walk/src/systems/wall-autotile.ts` (mirror).

**Process**:
1. Start with the table from §4.
2. Run `bun run dev` for each subsystem; navigate via Chrome DevTools MCP (`mcp__chrome-devtools__new_page`, `take_screenshot`).
3. Eyeball patterns that read wrong (T-junctions, corner connections, lone pillars). Common offenders likely: masks 11, 14, 1, 4, 8.
4. Swap in alternative frames from the 0x72 set as needed:
   - Try `wall_outer_top_left`/`wall_outer_top_right` for top corners.
   - Try `wall_outer_mid_left`/`wall_outer_mid_right` for solo-axis stubs.
   - Try `wall_edge_top_left`/`wall_edge_top_right` for some convex corners.
5. Keep the two subsystems' tables synced (extract to a shared inline constant in each file — these aren't shared via forge yet).
6. Acceptable bar: a player walking the perimeter and around pillars sees coherent corners and straight runs. T-junctions can be visually rough — flag for forge promotion polish.

**LOC**: ~10 in each table file (iteration only). **Parallelisable**: no (visual feedback loop with humans). **Agent**: `coder` running interactively with DevTools MCP.

### Phase 2 verification

- `bun test` — replays still match. Wall positions and entity count didn't change, only sprite frames did, which don't influence the world hash (bestiary hashes mob positions; dungeon-walk hashes counts + reached state).
- `bun run typecheck` per subsystem — clean.
- Visual checklist:
  - Bestiary arena perimeter: top/bottom rows show top-edge or mid frames; left/right columns show vertical edge frames; the 4 outer corners look like corners.
  - Bestiary pillars: 5 random pillars render as `column_wall` (isolated mask=0).
  - Dungeon-walk corridors: straight horizontal and vertical runs read as walls; junctions inside rooms read as corners.
  - Both: no white missing-frame placeholders (Pixi default for unknown frame name).

### Phase 2 commit

Single atomic commit: `feat(walls): autotile rendering via 4-bit neighbor bitmask`

```
- add wall_autotile_system on startup stage (both subsystems)
- WALL_FRAME_BY_PATTERN maps 16 N|E|S|W patterns to 0x72 frame names
- re-run autotile on regenerate_arena / regenerate_dungeon
- remove placeholder uniform wall_mid mapping from sprite-attach

walls now render with proper corners, edges, T-junctions, and pillars.
sim state unchanged — replays still match phase 1 baselines.
```

---

## §8 Verification

### Test commands

From `/Users/tom/dev/echo`:

```sh
bun test
cd subsystems/bestiary && bun run typecheck && bun run build && cd ../..
cd subsystems/dungeon-walk && bun run typecheck && bun run build && cd ../..
```

### Replay re-record commands

```sh
cd /Users/tom/dev/echo/subsystems/bestiary && bun run record:arena
cd /Users/tom/dev/echo/subsystems/dungeon-walk && bun run record
```

### Baseline hash update location

`subsystems/bestiary/test/replay.test.ts:23` — single line:

```ts
const expected_hash = "<new sha256>";
```

After the record step, run `bun test` once — the failing assertion in `tick 600 — world hash matches expected snapshot` will print the new actual hash. Copy that hash into the literal.

Dungeon-walk has no comparable baseline literal — its `hash_world` is internal only.

### Visual smoke checklist

Run via Chrome DevTools MCP after each phase. Use `mcp__chrome-devtools__new_page` to load the dev server, then `take_screenshot` between actions:

Phase 1 (uniform brick walls):
- [ ] Bestiary: walk in each of the 4 cardinal directions — player stops at perimeter.
- [ ] Bestiary: chase a chaser around — it routes around pillars (visible as brick squares).
- [ ] Bestiary: lighting darkens cells outside player FOV.
- [ ] Dungeon-walk: every non-corridor/non-room cell renders as brick.
- [ ] Dungeon-walk: player reaches exit; restart regenerates.

Phase 2 (autotile):
- [ ] Bestiary: outer corners visibly different from edge midpoints.
- [ ] Bestiary: pillars look like columns, not 4-way intersections.
- [ ] Dungeon-walk: corridor T-junctions look like junctions, not solid blocks.

---

## §9 Resolved decisions

1. **Sprite anchor for walls**: `{ x: 0.5, y: 0.5 }`. All 0x72 wall frames are 16×16 like floor frames; center anchor matches existing floor pattern at `bestiary/src/systems/sprite-attach.ts:23`.
2. **`pos_c` for walls**: `g.cell_to_world(cx, cy)`. Inspection of the existing floor entity spawn at `arena-gen.ts:96-100` shows `cell_to_world` already returns the value used as the entity's world position — confirmed correct by the floor sprite rendering correctly in the running game.
3. **wall_index_system stage**: `"pre"`. AI think (`"update"`), movement (`"update"`), lighting (`"render"`) all read `wall_index_r` after `"pre"` runs. Resource set in `"pre"` is visible to all subsequent stages in the same tick.
4. **`visual_pos_c` on walls**: no. Walls are static. Pixi sprite renders at `pos_c` directly when `visual_pos_c` is absent. Forge's render layer handles this fallback. (If forge requires `visual_pos_c` to render, ADD it and set `visual_pos_c = { ...pos_c }` — but the simpler path is to omit and verify in Phase 1 visual smoke.) **Mitigation**: if Phase 1 visual check shows walls invisible, add `[visual_pos_c, { ...p }]` to the spawn entries (a 1-line patch).
5. **Outer arena border**: spawn perimeter wall entities — `x ∈ {0, cols-1}` and `y ∈ {0, rows-1}` cells become wall entities in bestiary. Dungeon-walk already includes its perimeter as "non-floor", so its existing non-floor loop covers this.
6. **Drop `floors: Set` entirely**: NO. Keep `floors` on `arena_r` / `dungeon_r`. Reasons:
   - Bestiary summoner spawn uses it for valid mob placement.
   - Dungeon-walk movement reads `dungeon.exit` adjacent to `floors`.
   - Dungeon-walk tests `restart.test.ts:88, 116, 119` assert against `floors.size`.
   - Cost is negligible (~500 ints).
   Removing `floors` is a separate refactor; not in scope.
7. **Forge promotion check-in**: §10 below flags `spatial_index` and `autotile` for forge v0.5.0 once a third consumer exists.
8. **Replay re-record timing**: after Phase 1 lands. Phase 2 changes sprite frame strings only; the replay test's world hash hashes mob positions / counts, not sprite components — so Phase 2 does not require re-recording.

### Additional decisions surfaced during code reading

9. **Dungeon-walk restart**: `restart_system` uses `despawn_marked` per-component (not `w.clear()`). Must add `wall_c` to the despawn list at `dungeon-walk/src/systems/restart.ts:7`. Bestiary uses `w.clear()` so no change needed there.

10. **`creature_occupancy_system` ordering**: stays on `"pre"`. Order within `"pre"` is registration order: `restart` → `wall_index` → `debug_toggle` → `creature_occupancy`. Confirmed via `plugin.ts:42-44`. `wall_index` doesn't read creature occupancy, and creature occupancy doesn't read walls — independent.

11. **Light_update resolver**: currently captures `floors` from `arena_r`/`dungeon_r` at resolve-time inside a closure that re-runs each render tick (it returns a NEW predicate from inside the system, see `plugin.ts:67-72` for bestiary). Swapping to `wall_index_r` is safe — resource lookup happens each tick. NOTE: the lighting predicate uses `is_blocking` semantics (true = blocks), which matches our `walls.has(k)` directly — simpler than the floor-flip.

12. **`apply_wall_autotile` re-entrancy**: the system uses `w.has(id, sprite_c)` as a "already done" guard. Restart calls `w.clear()` (bestiary) or removes wall entities (dungeon-walk), so the new wall entities won't have sprite_c yet and the autotile runs cleanly. Safe.

13. **`floor_c` floor entities — no autotile**: floors keep their `floor_1` frame from `sprite-attach.ts`. Not in scope.

---

## §10 Forge promotion future-state

After Phase 2 ships, two patterns are duplicated across `bestiary` and `dungeon-walk`:

### Candidate 1 — `spatial_index`

A generic system that builds an O(1) lookup index over `[pos_c, <marker_c>]` entities. Both subsystems instantiate it for `wall_c`; future subsystems will want it for `enemy_c`, `pickup_c`, etc.

Proposed forge shape (sketch — not for implementation now):

```ts
// @f0rbit/forge
export const make_spatial_index_system = <T extends Component<true>>(
	marker: T,
	grid: Grid,
	resource: ResKey<{ cells: ReadonlySet<number> }>,
): System => (w, ctx) => {
	const cells = new Set<number>();
	for (const [, p] of w.query([pos_c, marker] as const).collect()) {
		const c = grid.world_to_cell(p.x, p.y);
		cells.add(grid.key(c.x, c.y));
	}
	ctx.res.set(resource, { cells });
};
```

Promotion gate per repo `AGENTS.md` §forge-promotion: needs a third in-subsystem use to qualify. Re-check at v0.5.0.

### Candidate 2 — `autotile` (4-bit cardinal bitmask)

A generic system that maps cells of a given component to sprite frames via a 16-entry pattern table.

Proposed forge shape:

```ts
// @f0rbit/forge
export const make_autotile_system = <T extends Component<true>>(
	marker: T,
	grid: Grid,
	frames: Readonly<Record<number, string>>,
	texture: string,
	anchor: { x: number; y: number } = { x: 0.5, y: 0.5 },
): System => /* ... */;
```

Promotion gate: needs a third consumer. Candidates: future doors, water, fences. Promote once 3+ in-game cell-types reach for it.

### Until promotion

The two systems live inside each subsystem's `src/systems/` directory. Doctrinal duplication (per repo `AGENTS.md` — duplication is the signal for forge promotion, not the problem itself).

---

## Suggested AGENTS.md updates

After Phase 2 commits, propose to the user adding to `/Users/tom/dev/echo/AGENTS.md`:

```md
## Wall entities + spatial index

Walls are first-class ECS entities (`wall_c`) across all subsystems. A `wall_index_r` resource is rebuilt each tick on `"pre"` from `[pos_c, wall_c]` queries and is the canonical source for `is_blocking` predicates in AI, movement, and lighting.

- Floor data still lives on `arena_r`/`dungeon_r` for spawn/exit logic but is NOT used for blocking checks.
- World-gen spawns perimeter walls explicitly — no implicit out-of-bounds blocking.
- Autotile (`wall_autotile_system`) runs on `"startup"` and on `regenerate_*` calls; sprite_c is the cache.
- `spatial_index` and `autotile` are forge promotion candidates for v0.5.0.
```

---

## Devpad tasks

Per repo workflow, mirror this plan into devpad after writing. Suggested entries (referencing this file's sections):

- `walls-as-entities P1.1 components+resources` → §6 Task 1.1
- `walls-as-entities P1.2 wall_index_system` → §6 Task 1.2 (a/b for parallel split)
- `walls-as-entities P1.3 world-gen spawn` → §6 Task 1.3 (a/b)
- `walls-as-entities P1.4 predicate swap` → §6 Task 1.4 (a/b)
- `walls-as-entities P1.5 placeholder sprite` → §6 Task 1.5
- `walls-as-entities P1.6 replay re-record` → §6 Task 1.6
- `walls-as-entities P1.verify` → §6 verification + commit
- `walls-as-entities P2.1 autotile system` → §7 Task 2.1 (a/b)
- `walls-as-entities P2.2 plugin wiring` → §7 Task 2.2 (a/b)
- `walls-as-entities P2.3 visual tuning` → §7 Task 2.3
- `walls-as-entities P2.verify` → §7 verification + commit
