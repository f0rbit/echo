import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import type { Cell } from "@f0rbit/forge/grid";
import { astar } from "../../astar.ts";
import { chaser_c, path_c, player_c, state_c } from "../../components.ts";
import { g } from "../../grid.ts";
import { arena_r } from "../../resources.ts";

export const chaser_think_system: System = (w, ctx) => {
	const arena = ctx.res.get(arena_r);
	if (!arena.ok) return;
	const { floors } = arena.value;
	const players = w.query([pos_c, player_c] as const).collect();
	if (players.length === 0) return;
	const pp = players[0]![1];
	const player_cell = g.world_to_cell(pp.x, pp.y);
	const is_blocking = (c: Cell): boolean => !floors.has(g.key(c.x, c.y));
	const passable = (c: Cell): boolean => floors.has(g.key(c.x, c.y));

	for (const [id, p, st] of w.query([pos_c, state_c, chaser_c] as const).collect()) {
		const my_cell = g.world_to_cell(p.x, p.y);
		const dist = g.chebyshev(my_cell, player_cell);
		const visible = g.line_of_sight({
			from: my_cell,
			radius: st.aggro_radius,
			is_blocking,
		});
		const has_los = visible.has(g.key(player_cell.x, player_cell.y));

		if (has_los && dist <= st.aggro_radius) {
			w.set(id, state_c, { kind: "chasing", aggro_radius: st.aggro_radius });
			const path = astar(g, my_cell, player_cell, { passable, max_steps: 200 });
			if (path && path.length > 0) w.set(id, path_c, { cells: path, index: 0 });
			else if (w.has(id, path_c)) w.remove(id, path_c);
		} else {
			w.set(id, state_c, { kind: "idle", aggro_radius: st.aggro_radius });
			if (w.has(id, path_c)) w.remove(id, path_c);
		}
	}
};
