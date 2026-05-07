import type { Id, System, World } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { line_of_sight } from "@f0rbit/forge/grid";
import { sprite_c } from "@f0rbit/forge/pixi";
import { exit_c, floor_c, player_c } from "../components.ts";
import { g } from "../grid.ts";
import { dungeon_r } from "../resources.ts";

const fov_radius = 6;

const set_visible = (w: World, id: Id, visible: boolean): void => {
	if (!w.has(id, sprite_c)) return;
	const sd = w.get(id, sprite_c);
	if (!sd.ok) return;
	w.set(id, sprite_c, { ...sd.value, visible });
};

export const fov_system: System = (w, ctx) => {
	const dungeon = ctx.res.get(dungeon_r);
	if (!dungeon.ok) return;

	const players = w.query_data([pos_c] as const, [player_c] as const).collect();
	if (players.length === 0) return;
	const pp = players[0]![1];
	const visible = line_of_sight({
		from: g.world_to_cell(pp.x, pp.y),
		radius: fov_radius,
		grid: g,
		is_blocking: cell => !dungeon.value.floors.has(g.key(cell.x, cell.y)),
	});

	for (const [id, p] of w.query_data([pos_c] as const, [floor_c] as const).collect()) {
		const c = g.world_to_cell(p.x, p.y);
		set_visible(w, id, visible.has(g.key(c.x, c.y)));
	}
	for (const [id, p] of w.query_data([pos_c] as const, [exit_c] as const).collect()) {
		const c = g.world_to_cell(p.x, p.y);
		set_visible(w, id, visible.has(g.key(c.x, c.y)));
	}
};
