import type { System } from "@f0rbit/forge";
import { ticks_per_step } from "@f0rbit/forge/grid";
import { dir_c, player_c } from "../components.ts";
import { g } from "../grid.ts";
import { arena_r } from "../resources.ts";

export const step_every = ticks_per_step(6, 1 / 60);

export const movement_system: System = (w, ctx) => {
	const arena = ctx.res.get(arena_r);
	if (!arena.ok) return;
	const { floors } = arena.value;
	const blocked_by = (cell: { x: number; y: number }): boolean =>
		!floors.has(g.key(cell.x, cell.y));

	for (const [id, d] of w.query([dir_c, player_c] as const).collect()) {
		g.move_tile(w, id, d, { blocked_by });
	}
};
