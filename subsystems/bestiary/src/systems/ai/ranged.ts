import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import type { Cell } from "@f0rbit/forge/grid";
import { astar } from "../../astar.ts";
import { path_c, player_c, projectile_c, ranged_c, telegraph_c } from "../../components.ts";
import { g } from "../../grid.ts";
import { arena_r, creature_occupancy_r } from "../../resources.ts";

const close_band = 4;
const far_band = 8;
const telegraph_ticks = 30;
const aggro_radius = 12;

const farthest_cell_from = (
	from: Cell,
	avoid: Cell,
	passable: (c: Cell) => boolean,
): Cell | null => {
	let best: Cell | null = null;
	let best_d = -1;
	const radius = 4;
	for (let dy = -radius; dy <= radius; dy++) {
		for (let dx = -radius; dx <= radius; dx++) {
			const c = { x: from.x + dx, y: from.y + dy };
			if (!g.in_bounds(c.x, c.y)) continue;
			if (!passable(c)) continue;
			const d = g.chebyshev(c, avoid);
			if (d > best_d) {
				best_d = d;
				best = c;
			}
		}
	}
	return best;
};

export const ranged_think_system: System = (w, ctx) => {
	const arena = ctx.res.get(arena_r);
	if (!arena.ok) return;
	const { floors } = arena.value;
	const occ = ctx.res.get(creature_occupancy_r);
	const occupancy = occ.ok ? occ.value.cells : new Set<number>();
	const players = w.query([pos_c, player_c] as const).collect();
	if (players.length === 0) return;
	const pp = players[0]![1];
	const player_cell = g.world_to_cell(pp.x, pp.y);
	const is_blocking = (c: Cell): boolean => !floors.has(g.key(c.x, c.y));

	const player_key = g.key(player_cell.x, player_cell.y);
	for (const [id, p] of w.query([pos_c, ranged_c] as const).collect()) {
		const my_cell = g.world_to_cell(p.x, p.y);
		const my_key = g.key(my_cell.x, my_cell.y);
		const passable_kite = (c: Cell): boolean => {
			const k = g.key(c.x, c.y);
			if (!floors.has(k)) return false;
			if (k === my_key) return true;
			if (occupancy.has(k)) return false;
			return true;
		};
		const passable_chase = (c: Cell): boolean => {
			const k = g.key(c.x, c.y);
			if (!floors.has(k)) return false;
			if (k === my_key) return true;
			if (k === player_key) return true;
			if (occupancy.has(k)) return false;
			return true;
		};
		const dist = g.chebyshev(my_cell, player_cell);
		const visible = g.line_of_sight({ from: my_cell, radius: aggro_radius, is_blocking });
		const has_los = visible.has(g.key(player_cell.x, player_cell.y));

		if (!has_los) {
			if (w.has(id, path_c)) w.remove(id, path_c);
			continue;
		}

		if (w.has(id, telegraph_c)) continue;

		if (dist < close_band) {
			const target = farthest_cell_from(my_cell, player_cell, passable_kite);
			if (!target) continue;
			const path = astar(g, my_cell, target, { passable: passable_kite, max_steps: 200 });
			if (path && path.length > 0) w.set(id, path_c, { cells: path, index: 0 });
			continue;
		}

		if (dist > far_band) {
			const path = astar(g, my_cell, player_cell, { passable: passable_chase, max_steps: 200 });
			if (path && path.length > 0) w.set(id, path_c, { cells: path, index: 0 });
			continue;
		}

		if (w.has(id, path_c)) w.remove(id, path_c);
		w.set(id, telegraph_c, {
			from: my_cell,
			to: player_cell,
			ticks_left: telegraph_ticks,
		});
	}
};

export const telegraph_tick_system: System = w => {
	for (const [id, tg] of w.query([telegraph_c] as const).collect()) {
		const next = tg.ticks_left - 1;
		if (next > 0) {
			w.set(id, telegraph_c, { from: tg.from, to: tg.to, ticks_left: next });
			continue;
		}
		const path: Cell[] = [];
		for (const c of g.line(tg.from, tg.to)) path.push(c);
		const start = path[0] ?? tg.from;
		w.spawn(
			[pos_c, g.cell_to_world(start.x, start.y)],
			[projectile_c, { path, index: 0 }],
		);
		w.remove(id, telegraph_c);
	}
};

export const projectile_step_system: System = (w, ctx) => {
	const arena = ctx.res.get(arena_r);
	if (!arena.ok) return;
	const { floors } = arena.value;
	for (const [id, , pr] of w.query([pos_c, projectile_c] as const).collect()) {
		const next_index = pr.index + 1;
		if (next_index >= pr.path.length) {
			w.despawn(id);
			continue;
		}
		const next_cell = pr.path[next_index]!;
		if (!floors.has(g.key(next_cell.x, next_cell.y))) {
			w.despawn(id);
			continue;
		}
		w.set(id, pos_c, g.cell_to_world(next_cell.x, next_cell.y));
		w.set(id, projectile_c, { path: pr.path, index: next_index });
	}
};
