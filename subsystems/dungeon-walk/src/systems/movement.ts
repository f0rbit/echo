import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { dir_c, player_c } from "../components.ts";
import { dungeon_r, score_r } from "../resources.ts";
import { cell_to_world, key, world_to_cell } from "../grid.ts";

export const step_every = 6;

export const movement_system: System = (w, ctx) => {
	if (ctx.time.tick % step_every !== 0) return;

	const dungeon = ctx.res.get(dungeon_r);
	if (!dungeon.ok) return;
	const { floors, exit } = dungeon.value;

	for (const [id, p, , d] of w.query([pos_c, player_c, dir_c] as const).collect()) {
		if (d.dx === 0 && d.dy === 0) continue;
		const cell = world_to_cell(p.x, p.y);
		const next_x = cell.x + d.dx;
		const next_y = cell.y + d.dy;
		const k = key(next_x, next_y);
		if (!floors.has(k)) continue;
		const world = cell_to_world(next_x, next_y);
		w.set(id, pos_c, { x: world.x, y: world.y });
		if (next_x === exit.x && next_y === exit.y) {
			const score = ctx.res.get(score_r);
			if (score.ok) score.value.reached_exit = true;
		}
	}
};
