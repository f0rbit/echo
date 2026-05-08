import type { Ctx, Rng, System, World } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import type { Cell } from "@f0rbit/forge/grid";
import {
	chaser_c,
	dir_c,
	floor_c,
	patrol_c,
	patroller_c,
	player_c,
	state_c,
} from "./components.ts";
import { fsm } from "./fsm.ts";
import { g } from "./grid.ts";
import { arena_r, run_seed_r } from "./resources.ts";

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
		...chaser_cells.map(c => g.key(c.x, c.y)),
		...patroller_waypoints.map(c => g.key(c.x, c.y)),
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

	ctx.res.set(arena_r, { cols: g.cols, rows: g.rows, floors, pillars, spawn: spawn_cell });

	const at = (c: Cell): { x: number; y: number } => g.cell_to_world(c.x, c.y);
	w.spawn_many([...floors].map(k => [[pos_c, at(g.unkey(k))], [floor_c, true]]));
	w.spawn([pos_c, at(spawn_cell)], [player_c, true], [dir_c, { dx: 0, dy: 0 }]);
	for (const c of chaser_cells) {
		w.spawn(
			[pos_c, at(c)],
			[chaser_c, true],
			[dir_c, { dx: 0, dy: 0 }],
			[state_c, { kind: "idle", aggro_radius: chaser_aggro }],
		);
	}
	w.spawn(
		[pos_c, at(patroller_cell)],
		[patroller_c, true],
		[dir_c, { dx: 0, dy: 0 }],
		[patrol_c, {
			waypoints: patroller_waypoints,
			index: 0,
			aggro_radius: patroller_aggro,
			fsm: fsm("patrolling", ctx.time.tick),
		}],
	);
};

export const arena_gen_system: System = (w, ctx) => {
	if (ctx.res.has(arena_r)) return;
	if (!ctx.res.has(run_seed_r)) ctx.res.set(run_seed_r, { base: ctx.rng.seed, restart_count: 0 });
	build_arena(w, ctx, ctx.rng);
};
