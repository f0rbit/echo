import { harness, pos_c, type Harness, type Id } from "@f0rbit/forge";
import { game_bindings } from "../../src/bindings.ts";
import {
	arena_r,
	creature_occupancy_r,
	level_up_pending_r,
	perk_registry_r,
	progress_r,
	run_seed_r,
	wall_index_r,
	type PerkRegistry,
} from "../../src/resources.ts";
import { g } from "../../src/grid.ts";
import {
	chaser_c,
	dir_c,
	hp_c,
	path_c,
	perks_c,
	player_c,
	state_c,
	stats_c,
	visual_pos_c,
	xp_c,
} from "../../src/components.ts";

export type ProgressScenarioOpts = {
	seed?: number;
	with_player?: boolean;
	player_cell?: { x: number; y: number };
	with_chasers?: number;
};

export type ProgressScenario = {
	h: Harness;
	tick: (real_dt?: number) => void;
	player_id: Id | null;
	chaser_ids: readonly Id[];
};

const fixed_dt = 1 / 60;

// Phase 5.1 fills this with a real `make_perk_registry(PERKS)` call. Until
// then, the empty map is enough for components/resources to typecheck and for
// the scaffold-stage smoke tests.
export const make_test_registry = (): PerkRegistry => ({ perks: new Map() });

// Phase 5.6 fills this — boots a fresh harness through its startup tick so
// `setup_progress` rehydrates static config (perk_registry_r) BEFORE the
// Snapshotter restores dynamic entity state on top. Per AGENTS.md
// "Snapshotter.restore() is destructive — boot the target first."
//
// Signature ahead of implementation so Phase 5.6 can drop it in without
// touching call sites.
export const make_restore_target = (opts: ProgressScenarioOpts = {}): ProgressScenario => {
	return make_progress_scenario(opts);
};

export const make_progress_scenario = (opts: ProgressScenarioOpts = {}): ProgressScenario => {
	const seed = opts.seed ?? 1;
	const h = harness({ seed, fixed_dt, bindings: game_bindings });

	h.res.set(arena_r, {
		cols: g.cols,
		rows: g.rows,
		width: g.cols * g.tile,
		height: g.rows * g.tile,
	});
	h.res.set(run_seed_r, { base: seed, restart_count: 0 });
	h.res.set(perk_registry_r, make_test_registry());
	h.res.set(creature_occupancy_r, { cells: new Set<number>() });
	h.res.set(wall_index_r, { cells: new Set<number>() });
	h.res.set(progress_r, { paused: false, dirty_stats: false });
	h.res.set(level_up_pending_r, { pending: false, choices: [] });

	let player_id: Id | null = null;
	if (opts.with_player) {
		const cell = opts.player_cell ?? { x: Math.floor(g.cols / 2), y: Math.floor(g.rows / 2) };
		const world_pos = g.cell_to_world(cell.x, cell.y);
		player_id = h.world.spawn(
			[player_c, true],
			[pos_c, world_pos],
			[visual_pos_c, { ...world_pos }],
			[dir_c, { dx: 0, dy: 0 }],
			[hp_c, { current: 10, max: 10 }],
			[xp_c, { current: 0, level: 1 }],
			[perks_c, { applied: [] }],
			[stats_c, { atk: 5, def: 2, spd: 1.0, max_hp: 10 }],
			[state_c, { kind: "idle" }],
		);
	}

	const chaser_count = opts.with_chasers ?? 0;
	const chaser_ids: Id[] = [];
	for (let i = 0; i < chaser_count; i++) {
		const cell = { x: 1 + i, y: 1 };
		const world_pos = g.cell_to_world(cell.x, cell.y);
		const id = h.world.spawn(
			[chaser_c, true],
			[pos_c, world_pos],
			[visual_pos_c, { ...world_pos }],
			[dir_c, { dx: 0, dy: 0 }],
			[hp_c, { current: 1, max: 1 }],
			[state_c, { kind: "idle" }],
			[path_c, { cells: [], idx: 0 }],
		);
		chaser_ids.push(id);
	}

	return { h, tick: h.tick, player_id, chaser_ids };
};
