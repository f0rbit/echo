import type { Id, System, World } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { sprite_c } from "@f0rbit/forge/pixi";
import { wall_c } from "../components.ts";
import { g } from "../grid.ts";

const N = 1;
const E = 2;
const S = 4;
const W = 8;

export const WALL_FRAME_BY_PATTERN: Readonly<Record<number, string>> = {
	0: "column_wall",
	1: "wall_outer_front_left",
	2: "wall_left",
	3: "wall_edge_bottom_left",
	4: "wall_top_mid",
	5: "wall_edge_mid_left",
	6: "wall_top_left",
	7: "wall_edge_tshape_left",
	8: "wall_right",
	9: "wall_edge_bottom_right",
	10: "wall_mid",
	11: "wall_edge_tshape_bottom_left",
	12: "wall_top_right",
	13: "wall_edge_tshape_right",
	14: "wall_edge_tshape_bottom_right",
	15: "wall_mid",
};

export const apply_wall_autotile = (w: World): void => {
	const cells = new Set<number>();
	const entries: Array<[Id, { cx: number; cy: number }]> = [];
	for (const [id, p] of w.query([pos_c, wall_c] as const).collect()) {
		const c = g.world_to_cell(p.x, p.y);
		cells.add(g.key(c.x, c.y));
		entries.push([id, { cx: c.x, cy: c.y }]);
	}
	for (const [id, { cx, cy }] of entries) {
		if (w.has(id, sprite_c)) continue;
		let mask = 0;
		if (cells.has(g.key(cx, cy - 1))) mask |= N;
		if (cells.has(g.key(cx + 1, cy))) mask |= E;
		if (cells.has(g.key(cx, cy + 1))) mask |= S;
		if (cells.has(g.key(cx - 1, cy))) mask |= W;
		const frame = WALL_FRAME_BY_PATTERN[mask] ?? "wall_mid";
		w.set(id, sprite_c, {
			texture: "dungeon",
			frame,
			anchor: { x: 0.5, y: 0.5 },
			visible: true,
		});
	}
};

export const wall_autotile_system: System = w => {
	apply_wall_autotile(w);
};
