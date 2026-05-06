import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { sprite_c } from "@f0rbit/forge/pixi";
import { player_c } from "../components.ts";
import { cell_index_r, dungeon_r } from "../resources.ts";
import { chebyshev, world_to_cell } from "../grid.ts";
import { fov_radius } from "../fov-calc.ts";

export const fov_system: System = (w, ctx) => {
	const idx = ctx.res.get(cell_index_r);
	const dungeon = ctx.res.get(dungeon_r);
	if (!idx.ok || !dungeon.ok) return;

	const player = w.query([pos_c, player_c] as const).collect();
	if (player.length === 0) return;
	const pp = player[0]![1];
	const pcell = world_to_cell(pp.x, pp.y);

	for (const [k, id] of idx.value.floor_at) {
		if (!w.has(id, sprite_c)) continue;
		const cx = k % dungeon.value.cols;
		const cy = Math.floor(k / dungeon.value.cols);
		const visible = chebyshev(pcell.x, pcell.y, cx, cy) <= fov_radius;
		const sd = w.get(id, sprite_c);
		if (sd.ok) w.set(id, sprite_c, { ...sd.value, visible });
	}

	const exit_id = idx.value.exit_id;
	if (exit_id !== null && w.has(exit_id, sprite_c)) {
		const exit = dungeon.value.exit;
		const visible = chebyshev(pcell.x, pcell.y, exit.x, exit.y) <= fov_radius;
		const sd = w.get(exit_id, sprite_c);
		if (sd.ok) w.set(exit_id, sprite_c, { ...sd.value, visible });
	}
};
