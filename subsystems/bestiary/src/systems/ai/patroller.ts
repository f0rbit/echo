import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import type { Cell } from "@f0rbit/forge/grid";
import { astar } from "../../astar.ts";
import { patrol_c, patroller_c, path_c, player_c } from "../../components.ts";
import { enter } from "../../fsm.ts";
import { g } from "../../grid.ts";
import { creature_occupancy_r, wall_index_r } from "../../resources.ts";

const same_cell = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;

const replan = (
	from: Cell,
	to: Cell,
	passable: (c: Cell) => boolean,
): { cells: readonly Cell[]; index: number } | null => {
	const path = astar(g, from, to, { passable, max_steps: 400 });
	if (!path || path.length === 0) return null;
	return { cells: path, index: 0 };
};

export const patroller_think_system: System = (w, ctx) => {
	const wi = ctx.res.get(wall_index_r);
	if (!wi.ok) return;
	const walls = wi.value.cells;
	const occ = ctx.res.get(creature_occupancy_r);
	const occupancy = occ.ok ? occ.value.cells : new Set<number>();
	const tick = ctx.time.tick;
	const players = w.query([pos_c, player_c] as const).collect();
	if (players.length === 0) return;
	const pp = players[0]![1];
	const player_cell = g.world_to_cell(pp.x, pp.y);
	const is_blocking = (c: Cell): boolean => walls.has(g.key(c.x, c.y));

	const player_key = g.key(player_cell.x, player_cell.y);
	for (const [id, p, pat] of w.query([pos_c, patrol_c, patroller_c] as const).collect()) {
		const my_cell = g.world_to_cell(p.x, p.y);
		const my_key = g.key(my_cell.x, my_cell.y);
		const passable = (c: Cell): boolean => {
			const k = g.key(c.x, c.y);
			if (walls.has(k)) return false;
			if (k === my_key) return true;
			if (k === player_key) return true;
			if (occupancy.has(k)) return false;
			return true;
		};
		const dist = g.chebyshev(my_cell, player_cell);
		const visible = g.line_of_sight({
			from: my_cell,
			radius: pat.aggro_radius,
			is_blocking,
		});
		const has_los = visible.has(g.key(player_cell.x, player_cell.y)) && dist <= pat.aggro_radius;

		const wp = pat.waypoints[pat.index]!;
		let next_state = pat.fsm.state;
		let next_index = pat.index;
		let target: Cell;

		if (has_los) {
			next_state = "pursuing";
			target = player_cell;
		} else if (pat.fsm.state === "pursuing") {
			next_state = "returning";
			target = wp;
		} else if (pat.fsm.state === "returning") {
			if (same_cell(my_cell, wp)) next_state = "patrolling";
			target = wp;
		} else {
			next_state = "patrolling";
			if (same_cell(my_cell, wp)) {
				next_index = (pat.index + 1) % pat.waypoints.length;
				target = pat.waypoints[next_index]!;
			} else target = wp;
		}

		const fsm_next = enter(pat.fsm, next_state, tick);
		const need_replan = fsm_next !== pat.fsm || next_index !== pat.index || !w.has(id, path_c);

		if (same_cell(my_cell, target)) {
			if (w.has(id, path_c)) w.remove(id, path_c);
		} else if (need_replan || next_state === "pursuing" || next_state === "patrolling") {
			const planned = replan(my_cell, target, passable);
			if (planned) w.set(id, path_c, planned);
			else {
				if (w.has(id, path_c)) w.remove(id, path_c);
				if (next_state === "patrolling") next_index = (next_index + 1) % pat.waypoints.length;
			}
		}

		w.set(id, patrol_c, {
			waypoints: pat.waypoints,
			index: next_index,
			aggro_radius: pat.aggro_radius,
			fsm: fsm_next,
		});
	}
};
