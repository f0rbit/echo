import type { Id, System, World } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { sprite_c } from "@f0rbit/forge/pixi";
import { wall_c } from "../components.ts";
import { g } from "../grid.ts";

const N = 1;
const E = 2;
const S = 4;
const W = 8;

const col_for = (mask: number): number => {
	const e = (mask & E) !== 0;
	const w = (mask & W) !== 0;
	if (!w && !e) return 0;
	if (!w && e) return 1;
	if (w && e) return 2;
	return 3;
};

const row_for = (mask: number): number => {
	const n = (mask & N) !== 0;
	const s = (mask & S) !== 0;
	if (!n && s) return 0;
	if (n && !s) return 3;
	if (!n && !s) return 0;
	return 1;
};

export const apply_wall_autotile = (w: World): void => {
	const cells = new Set<number>();
	const entries: Array<[Id, { cx: number; cy: number }]> = [];
	for (const [id, p] of w.query([pos_c, wall_c] as const).collect()) {
		const c = g.world_to_cell(p.x, p.y);
		cells.add(g.key(c.x, c.y));
		entries.push([id, { cx: c.x, cy: c.y }]);
	}
	const is_wall = (x: number, y: number): boolean =>
		!g.in_bounds(x, y) || cells.has(g.key(x, y));
	for (const [id, { cx, cy }] of entries) {
		if (w.has(id, sprite_c)) continue;
		let mask = 0;
		if (is_wall(cx, cy - 1)) mask |= N;
		if (is_wall(cx + 1, cy)) mask |= E;
		if (is_wall(cx, cy + 1)) mask |= S;
		if (is_wall(cx - 1, cy)) mask |= W;
		const col = col_for(mask);
		const row = row_for(mask);
		const frame = `wat_${col}_${row}`;
		w.set(id, sprite_c, {
			texture: "walls",
			frame,
			anchor: { x: 0.5, y: 0.5 },
			visible: true,
		});
	}
};

export const wall_autotile_system: System = w => {
	apply_wall_autotile(w);
};
