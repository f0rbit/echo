import type { System } from "@f0rbit/forge";
import { ticks_per_step } from "@f0rbit/forge/grid";
import { dir_c, player_c } from "../components.ts";
import { g } from "../grid.ts";
import { wall_index_r } from "../resources.ts";

export const step_every = ticks_per_step(6, 1 / 60);

export const movement_system: System = (w, ctx) => {
	const wi = ctx.res.get(wall_index_r);
	if (!wi.ok) return;
	const walls = wi.value.cells;
	const blocked_by = (cell: { x: number; y: number }): boolean =>
		walls.has(g.key(cell.x, cell.y));

	for (const [id, d] of w.query([dir_c, player_c] as const).collect()) {
		g.move_tile(w, id, d, { blocked_by });
	}
};
