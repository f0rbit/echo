import type { Ctx, Rng, System, World } from "@f0rbit/forge";
import { pos_c, rng as make_rng } from "@f0rbit/forge";
import type { Cell } from "@f0rbit/forge/grid";
import {
	chaser_c,
	dir_c,
	enemy_c,
	floor_c,
	patrol_c,
	patroller_c,
	player_c,
	ranged_c,
	state_c,
	summoner_c,
	summoner_state_c,
	visual_pos_c,
	wall_c,
} from "./components.ts";
import { fsm } from "./fsm.ts";
import { g } from "./grid.ts";
import { arena_r, run_seed_r } from "./resources.ts";
import { apply_wall_autotile } from "@f0rbit/forge/autotile";

const pillar_count = 5;
const spawn_cell: Cell = { x: 15, y: 10 };
const chaser_cells: readonly Cell[] = [
	{ x: 5, y: 5 },
	{ x: 25, y: 15 },
];
const chaser_aggro = 12;
const patroller_cell: Cell = { x: 10, y: 10 };
const patroller_aggro = 8;
const patroller_waypoints: readonly Cell[] = [
	{ x: 8, y: 5 },
	{ x: 22, y: 5 },
	{ x: 22, y: 15 },
	{ x: 8, y: 15 },
];
const ranged_cell: Cell = { x: 20, y: 5 };
const summoner_cell: Cell = { x: 15, y: 4 };
export const brazier_cells: readonly Cell[] = [
	{ x: 8, y: 6 },
];
const summoner_spawn_every = 60;
const summoner_max_minions = 4;

const adjacent_keys = (c: Cell): readonly number[] => {
	const keys: number[] = [];
	for (let dy = -1; dy <= 1; dy++) {
		for (let dx = -1; dx <= 1; dx++) {
			if (dx === 0 && dy === 0) continue;
			keys.push(g.key(c.x + dx, c.y + dy));
		}
	}
	return keys;
};

const interior_floor_keys = (): Set<number> => {
	const floors = new Set<number>();
	for (let y = 1; y < g.rows - 1; y++) {
		for (let x = 1; x < g.cols - 1; x++) floors.add(g.key(x, y));
	}
	return floors;
};

const place_pillars = (floors: Set<number>, r: Rng): Set<number> => {
	const pillars = new Set<number>();
	const reserved = new Set<number>([
		g.key(spawn_cell.x, spawn_cell.y),
		g.key(patroller_cell.x, patroller_cell.y),
		g.key(ranged_cell.x, ranged_cell.y),
		g.key(summoner_cell.x, summoner_cell.y),
		...chaser_cells.map(c => g.key(c.x, c.y)),
		...patroller_waypoints.map(c => g.key(c.x, c.y)),
		...brazier_cells.map(c => g.key(c.x, c.y)),
		...adjacent_keys(summoner_cell),
	]);
	let attempts = 0;
	while (pillars.size < pillar_count && attempts < 200) {
		attempts++;
		const x = r.int(2, g.cols - 3);
		const y = r.int(2, g.rows - 3);
		const k = g.key(x, y);
		if (reserved.has(k)) continue;
		if (pillars.has(k)) continue;
		pillars.add(k);
		floors.delete(k);
	}
	return pillars;
};

export const build_arena = (w: World, ctx: Ctx, rng: Rng): void => {
	const floors = interior_floor_keys();
	const pillars = place_pillars(floors, rng);

	ctx.res.set(arena_r, { cols: g.cols, rows: g.rows, floors, spawn: spawn_cell });

	const wall_cells = new Set<number>();
	for (let x = 0; x < g.cols; x++) {
		wall_cells.add(g.key(x, 0));
		wall_cells.add(g.key(x, g.rows - 1));
	}
	for (let y = 1; y < g.rows - 1; y++) {
		wall_cells.add(g.key(0, y));
		wall_cells.add(g.key(g.cols - 1, y));
	}
	for (const k of pillars) wall_cells.add(k);

	const at = (c: Cell): { x: number; y: number } => g.cell_to_world(c.x, c.y);
	w.spawn_many([...floors].map(k => {
		const p = at(g.unkey(k));
		return [[pos_c, p], [visual_pos_c, { ...p }], [floor_c, true]];
	}));
	w.spawn_many([...wall_cells].map(k => {
		const p = at(g.unkey(k));
		return [[pos_c, p], [visual_pos_c, { ...p }], [floor_c, true]];
	}));
	w.spawn_many([...wall_cells].map(k => {
		const p = at(g.unkey(k));
		return [[pos_c, p], [visual_pos_c, { ...p }], [wall_c, true]];
	}));
	const spawn_pos = at(spawn_cell);
	w.spawn(
		[pos_c, spawn_pos],
		[visual_pos_c, { ...spawn_pos }],
		[player_c, true],
		[dir_c, { dx: 0, dy: 0 }],
	);
	for (const c of chaser_cells) {
		const cp = at(c);
		w.spawn(
			[pos_c, cp],
			[visual_pos_c, { ...cp }],
			[chaser_c, true],
			[enemy_c, true],
			[dir_c, { dx: 0, dy: 0 }],
			[state_c, { kind: "idle", aggro_radius: chaser_aggro }],
		);
	}
	const pat_pos = at(patroller_cell);
	w.spawn(
		[pos_c, pat_pos],
		[visual_pos_c, { ...pat_pos }],
		[patroller_c, true],
		[enemy_c, true],
		[dir_c, { dx: 0, dy: 0 }],
		[patrol_c, {
			waypoints: patroller_waypoints,
			index: 0,
			aggro_radius: patroller_aggro,
			fsm: fsm("patrolling", ctx.time.tick),
		}],
	);
	const rng_pos = at(ranged_cell);
	w.spawn(
		[pos_c, rng_pos],
		[visual_pos_c, { ...rng_pos }],
		[ranged_c, true],
		[enemy_c, true],
		[dir_c, { dx: 0, dy: 0 }],
	);
	const sum_pos = at(summoner_cell);
	w.spawn(
		[pos_c, sum_pos],
		[visual_pos_c, { ...sum_pos }],
		[summoner_c, true],
		[enemy_c, true],
		[dir_c, { dx: 0, dy: 0 }],
		[summoner_state_c, {
			spawn_every: summoner_spawn_every,
			next_spawn_tick: ctx.time.tick + summoner_spawn_every,
			max_minions: summoner_max_minions,
		}],
	);
};

export const arena_gen_system: System = (w, ctx) => {
	if (ctx.res.has(arena_r)) return;
	if (!ctx.res.has(run_seed_r)) ctx.res.set(run_seed_r, { base: ctx.rng.seed, restart_count: 0 });
	build_arena(w, ctx, ctx.rng);
};

export const regenerate_arena = (w: World, ctx: Ctx): void => {
	const seed = ctx.res.get(run_seed_r);
	const base = seed.ok ? seed.value.base : ctx.rng.seed;
	const restart_count = (seed.ok ? seed.value.restart_count : 0) + 1;
	ctx.res.set(run_seed_r, { base, restart_count });
	build_arena(w, ctx, make_rng(base + restart_count));
	apply_wall_autotile(w, { wall_c, texture: "walls", grid: g });
};
