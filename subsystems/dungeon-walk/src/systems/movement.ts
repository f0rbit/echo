import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { move_tile, ticks_per_step } from "@f0rbit/forge/grid";
import { dir_c, player_c } from "../components.ts";
import { g } from "../grid.ts";
import { dungeon_r, score_r } from "../resources.ts";

export const step_every = ticks_per_step(6, 1 / 60);

export const movement_system: System = (w, ctx) => {
	const score = ctx.res.get(score_r);
	if (score.ok && score.value.reached_exit) return;
	const dungeon = ctx.res.get(dungeon_r);
	if (!dungeon.ok) return;
	const { floors, exit } = dungeon.value;
	const blocked_by = (cell: { x: number; y: number }): boolean =>
		!floors.has(g.key(cell.x, cell.y));

	for (const [id, d] of w.query_data([dir_c] as const, [player_c] as const).collect()) {
		const r = move_tile(w, id, pos_c, g, d, { blocked_by });
		if (r.ok && r.value.moved && r.value.to.x === exit.x && r.value.to.y === exit.y) {
			if (score.ok) score.value.reached_exit = true;
		}
	}
};
