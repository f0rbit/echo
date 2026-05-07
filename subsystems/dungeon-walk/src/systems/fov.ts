import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { sprite } from "@f0rbit/forge/pixi";
import { exit_c, floor_c, player_c } from "../components.ts";
import { g } from "../grid.ts";
import { dungeon_r } from "../resources.ts";

const fov_radius = 6;

export const fov_system: System = (w, ctx) => {
	const dungeon = ctx.res.get(dungeon_r);
	if (!dungeon.ok) return;

	const players = w.query([pos_c, player_c] as const).collect();
	if (players.length === 0) return;
	const pp = players[0]![1];
	const visible = g.line_of_sight({
		from: g.world_to_cell(pp.x, pp.y),
		radius: fov_radius,
		is_blocking: cell => !dungeon.value.floors.has(g.key(cell.x, cell.y)),
	});

	for (const marker of [floor_c, exit_c]) {
		for (const [id, p] of w.query([pos_c, marker] as const).collect()) {
			const c = g.world_to_cell(p.x, p.y);
			sprite.set(w, id, { visible: visible.has(g.key(c.x, c.y)) });
		}
	}
};
