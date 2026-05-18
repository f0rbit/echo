// arena-gen.ts — startup: install resources + spawn player. NO chasers
// at boot — enemy_spawn_system handles spawn cadence (1 / 60 ticks).
//
// Mirrors loot's arena-gen shape (per .plans/progress.md §2 Q1 cell-step
// convention). Per §2 Q14 the perk registry is rehydrated here — static
// config, NOT snapshotted (AGENTS.md "Static config does NOT go in the
// snapshot"). Phase 5.5+'s restore() relies on this running first.
//
// creature_occupancy_r + wall_index_r are seeded empty so the copied
// chaser AI + path-step systems boot cleanly without crashing on a
// missing-resource lookup. Both rehydrate every tick.
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
// reads them); walls are also visual-only — the existing enemy_spawn pool
// already restricts chasers to the 8-cell interior subset (corners +
// cardinal midpoints at x:1..cols-2, y:1..rows-2), so no spawn-pool change
// is needed. Stable iteration order (y-major, x-minor) keeps entity-IDs
// deterministic across replay runs.
const spawn_tiles = (w: World): void => {
	for (let cy = 0; cy < g.rows; cy++) {
		for (let cx = 0; cx < g.cols; cx++) {
			const p = g.cell_to_world(cx, cy);
			w.spawn([pos_c, p], [floor_c, true]);
		}
	}
	for (let cy = 0; cy < g.rows; cy++) {
		for (let cx = 0; cx < g.cols; cx++) {
			const on_edge = cx === 0 || cx === g.cols - 1 || cy === 0 || cy === g.rows - 1;
			if (!on_edge) continue;
			const p = g.cell_to_world(cx, cy);
			w.spawn([pos_c, p], [wall_c, true]);
		}
	}
};

const spawn_player = (w: World, cell: Cell): void => {
	const wp = g.cell_to_world(cell.x, cell.y);
	w.spawn(
		[player_c, true],
		[pos_c, wp],
		[visual_pos_c, { ...wp }],
		[dir_c, { dx: 0, dy: 0 }],
		[hp_c, { current: BASE_STATS.max_hp, max: BASE_STATS.max_hp }],
		[xp_c, { current: 0, level: 1 }],
		[perks_c, { applied: [] }],
		[stats_c, { ...BASE_STATS }],
	);
};

export const setup_arena = (w: World, ctx: Ctx): void => {
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
	ctx.res.set(wall_index_r, { cells: new Set<number>() });
	ctx.res.set(progress_r, { paused: false, dirty_stats: false });
	ctx.res.set(level_up_pending_r, { pending: false, choices: [] });

	spawn_tiles(w);
	spawn_player(w, PLAYER_SPAWN);
};

export const make_arena_gen_system = (): System => (w, ctx) => {
	setup_arena(w, ctx);
};
