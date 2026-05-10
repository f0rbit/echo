import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { enemy_c, player_c } from "../components.ts";
import { g } from "../grid.ts";
import { creature_occupancy_r } from "../resources.ts";

export const creature_occupancy_system: System = (w, ctx) => {
	const cells = new Set<number>();
	for (const [, p] of w.query([pos_c, enemy_c] as const).collect()) {
		const c = g.world_to_cell(p.x, p.y);
		cells.add(g.key(c.x, c.y));
	}
	for (const [, p] of w.query([pos_c, player_c] as const).collect()) {
		const c = g.world_to_cell(p.x, p.y);
		cells.add(g.key(c.x, c.y));
	}
	ctx.res.set(creature_occupancy_r, { cells });
};
