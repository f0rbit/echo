import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { enemy_c } from "../components.ts";
import { g } from "../grid.ts";
import { enemy_occupancy_r } from "../resources.ts";

export const enemy_occupancy_system: System = (w, ctx) => {
	const cells = new Set<number>();
	for (const [, p] of w.query([pos_c, enemy_c] as const).collect()) {
		const c = g.world_to_cell(p.x, p.y);
		cells.add(g.key(c.x, c.y));
	}
	ctx.res.set(enemy_occupancy_r, { cells });
};
