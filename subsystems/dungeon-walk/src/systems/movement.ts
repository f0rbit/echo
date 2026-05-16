import type { System } from "@f0rbit/forge";
import { ticks_per_step } from "@f0rbit/forge/grid";
import { dir_c, player_c } from "../components.ts";
import { g } from "../grid.ts";
import { dungeon_r, score_r, wall_index_r } from "../resources.ts";

export const step_every = ticks_per_step(6, 1 / 60);

export const movement_system: System = (w, ctx) => {
	const score = ctx.res.get(score_r);
	if (score.ok && score.value.reached_exit) return;
	const dungeon = ctx.res.get(dungeon_r);
	if (!dungeon.ok) return;
	const wi = ctx.res.get(wall_index_r);
	if (!wi.ok) return;
	const walls = wi.value.cells;
	const { exit } = dungeon.value;
	const blocked_by = (cell: { x: number; y: number }): boolean =>
		walls.has(g.key(cell.x, cell.y));

	for (const [id, d] of w.query([dir_c, player_c] as const).collect()) {
		const r = g.move_tile(w, id, d, { blocked_by });
		if (r.ok && r.value.moved && r.value.to.x === exit.x && r.value.to.y === exit.y) {
			if (score.ok) score.value.reached_exit = true;
		}
	}
};
