// arena-gen.ts — startup: install resources + spawn player. NO chasers
// at boot — enemy_spawn_system handles spawn cadence (1 / 60 ticks).
//
// Mirrors loot's arena-gen shape (per .plans/progress.md §2 Q1 cell-step
// convention). Per §2 Q14 the perk registry is rehydrated here — static
// config, NOT snapshotted (AGENTS.md "Static config does NOT go in the
// snapshot"). Phase 5.5+'s restore() relies on this running first.
//
// wall_index_r is seeded with the perimeter cell ring so movement +
// ai-chaser + path-step all share the same blocked predicate (cells
// 0/cols-1 along x, 0/rows-1 along y are walls). Like perk_registry_r,
// wall_index_r is NOT in the snapshot — it's rehydrated at startup so
// restore() preserves it. creature_occupancy_r is seeded empty and
// rebuilt every tick by creature_occupancy_system.
import type { Ctx, System, World } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import type { Cell } from "@f0rbit/forge/grid";
import {
	dir_c,
	floor_c,
	hp_c,
	perks_c,
	player_c,
	stats_c,
	visual_pos_c,
	wall_c,
	xp_c,
} from "./components.ts";
import { g } from "./grid.ts";
import {
	arena_r,
	creature_occupancy_r,
	level_up_pending_r,
	perk_registry_r,
	progress_r,
	run_seed_r,
	wall_index_r,
} from "./resources.ts";
import { make_perk_registry } from "./data/perks.ts";
import { BASE_STATS } from "./systems/stats.ts";

const PLAYER_SPAWN: Cell = { x: 10, y: 5 };

// Spawn a floor entity at every cell and a wall entity at perimeter cells.
// Floors are a deterministic, render-only carpet (no AI/collision/replay-state
// reads them); walls are decorative entities + their cell keys feed
// wall_index_r (see perimeter_keys below). The existing enemy_spawn pool
// already restricts chasers to the 8-cell interior subset (corners +
// cardinal midpoints at x:1..cols-2, y:1..rows-2), so no spawn-pool change
// is needed. Stable iteration order (y-major, x-minor) keeps entity-IDs
// deterministic across replay runs.
//
// Idempotent: skips spawning if any floor_c entity already exists. Safe to
// call from both the startup `arena_gen` system AND from main.ts after
// disk-restore (which destructively clears the world — see AGENTS.md
// "Snapshotter.restore() is destructive"). Without the guard, a normal
// boot (no save) would double-spawn since `setup_static` runs in both
// `setup_arena` (startup) and could be called again post-restore.
const spawn_tiles = (w: World): void => {
	const existing = w.query([floor_c] as const).collect();
	if (existing.length > 0) return;
	for (let cy = 0; cy < g.rows; cy++) {
		for (let cx = 0; cx < g.cols; cx++) {
			const p = g.cell_to_world(cx, cy);
			w.spawn([pos_c, p], [visual_pos_c, { ...p }], [floor_c, true]);
		}
	}
	for (let cy = 0; cy < g.rows; cy++) {
		for (let cx = 0; cx < g.cols; cx++) {
			const on_edge = cx === 0 || cx === g.cols - 1 || cy === 0 || cy === g.rows - 1;
			if (!on_edge) continue;
			const p = g.cell_to_world(cx, cy);
			w.spawn([pos_c, p], [visual_pos_c, { ...p }], [wall_c, true]);
		}
	}
};

// Perimeter cell keys — fed to wall_index_r so movement / ai-chaser /
// path-step share one source of truth for "wall" cells.
const perimeter_keys = (): ReadonlySet<number> => {
	const out = new Set<number>();
	for (let cx = 0; cx < g.cols; cx++) {
		out.add(g.key(cx, 0));
		out.add(g.key(cx, g.rows - 1));
	}
	for (let cy = 0; cy < g.rows; cy++) {
		out.add(g.key(0, cy));
		out.add(g.key(g.cols - 1, cy));
	}
	return out;
};

const spawn_player = (w: World, cell: Cell): void => {
	const wp = g.cell_to_world(cell.x, cell.y);
	w.spawn(
		[player_c, true],
		[pos_c, wp],
		[visual_pos_c, { ...wp }],
		// Initial facing right ({1, 0}). input.ts is facing-persistent (only
		// writes dir_c on nonzero input), so the spawn-cell value sticks
		// until the player first moves. Gives a clean visual heading and
		// (in case any future directional ability reads dir_c) a sensible
		// default. Melee-swing is direction-agnostic chebyshev-1, so this
		// only matters for facing-only effects.
		[dir_c, { dx: 1, dy: 0 }],
		[hp_c, { current: BASE_STATS.max_hp, max: BASE_STATS.max_hp }],
		[xp_c, { current: 0, level: 1 }],
		[perks_c, { applied: [] }],
		[stats_c, { ...BASE_STATS }],
	);
};

// setup_static — resources + tile entities (floors + walls). Idempotent
// across both code paths it's called from:
//   1. Startup `arena_gen` system (fresh boot, no snapshot).
//   2. main.ts post-restore (after `snapper.restore` destructively cleared
//      the entity world but preserved non-snapshotted resources — see
//      AGENTS.md "Static config NOT in snapshot"; floors + walls vanish
//      because they're entities, not resources).
// `spawn_tiles` skips when floor_c entities already exist. Resource writes
// that are pure functions of static state (arena_r, perk_registry_r,
// wall_index_r, creature_occupancy_r) overwrite safely. Snapshotted
// resources (progress_r, level_up_pending_r) are guarded so a post-restore
// call doesn't clobber restored state; run_seed_r's get-or-default
// preserves the restored base/restart_count.
export const setup_static = (w: World, ctx: Ctx): void => {
	ctx.res.set(arena_r, {
		cols: g.cols,
		rows: g.rows,
		width: g.cols * g.tile,
		height: g.rows * g.tile,
	});
	const prev_seed = ctx.res.get(run_seed_r);
	const base = prev_seed.ok ? prev_seed.value.base : ctx.rng.seed;
	const restart_count = prev_seed.ok ? prev_seed.value.restart_count : 0;
	ctx.res.set(run_seed_r, { base, restart_count });

	const reg = make_perk_registry();
	ctx.res.set(perk_registry_r, { perks: reg.perks as unknown as Map<string, unknown> });

	ctx.res.set(creature_occupancy_r, { cells: new Set<number>() });
	ctx.res.set(wall_index_r, { cells: perimeter_keys() });
	if (!ctx.res.get(progress_r).ok) ctx.res.set(progress_r, { paused: false, dirty_stats: false, dead: false });
	if (!ctx.res.get(level_up_pending_r).ok) ctx.res.set(level_up_pending_r, { pending: false, choices: [] });

	spawn_tiles(w);
};

// setup_dynamic — player spawn. NOT idempotent: re-running spawns a
// duplicate player. Must NOT be called after disk-restore (the snapshot
// already contains the player entity).
export const setup_dynamic = (w: World): void => {
	spawn_player(w, PLAYER_SPAWN);
};

export const setup_arena = (w: World, ctx: Ctx): void => {
	setup_static(w, ctx);
	setup_dynamic(w);
};

export const make_arena_gen_system = (): System => (w, ctx) => {
	setup_arena(w, ctx);
};
