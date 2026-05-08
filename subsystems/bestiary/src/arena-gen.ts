import type { Ctx, Rng, System, World } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import type { Cell } from "@f0rbit/forge/grid";
import { dir_c, floor_c, player_c } from "./components.ts";
import { g } from "./grid.ts";
import { arena_r, run_seed_r } from "./resources.ts";

const pillar_count = 5;
const spawn_cell: Cell = { x: 15, y: 10 };

const interior_floor_keys = (): Set<number> => {
	const floors = new Set<number>();
	for (let y = 1; y < g.rows - 1; y++) {
		for (let x = 1; x < g.cols - 1; x++) floors.add(g.key(x, y));
	}
	return floors;
};

const place_pillars = (floors: Set<number>, r: Rng): Set<number> => {
	const pillars = new Set<number>();
	const spawn_key = g.key(spawn_cell.x, spawn_cell.y);
	let attempts = 0;
	while (pillars.size < pillar_count && attempts < 200) {
		attempts++;
		const x = r.int(2, g.cols - 3);
		const y = r.int(2, g.rows - 3);
		const k = g.key(x, y);
		if (k === spawn_key) continue;
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
};

export const arena_gen_system: System = (w, ctx) => {
	if (ctx.res.has(arena_r)) return;
	if (!ctx.res.has(run_seed_r)) ctx.res.set(run_seed_r, { base: ctx.rng.seed, restart_count: 0 });
	build_arena(w, ctx, ctx.rng);
};
