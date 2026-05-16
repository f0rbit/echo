import type { Id, System, World } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { sprite_c } from "@f0rbit/forge/pixi";
import { wall_c } from "../components.ts";
import { g } from "../grid.ts";

const N = 1;
const E = 2;
const S = 4;
const W = 8;

const PATTERN_TO_TILE: Readonly<Record<number, { col: number; row: number }>> = {
	0b0000: { col: 0, row: 0 },   // isolated -> vertical pillar top
	0b0001: { col: 0, row: 2 },   // N only -> bottom-cap of vertical
	0b0010: { col: 8, row: 0 },   // E only -> horizontal left-cap (thin wall row 0)
	0b0011: { col: 1, row: 0 },   // N+E -> inner corner, opens SW
	0b0100: { col: 0, row: 0 },   // S only -> top-cap of vertical
	0b0101: { col: 0, row: 1 },   // N+S -> vertical run middle
	0b0110: { col: 1, row: 3 },   // S+E -> inner corner, opens NW
	0b0111: { col: 1, row: 1 },   // N+E+S -> T-opens-W (right edge of room)
	0b1000: { col: 11, row: 0 },  // W only -> horizontal right-cap (thin wall row 0)
	0b1001: { col: 3, row: 0 },   // N+W -> inner corner, opens SE
	0b1010: { col: 9, row: 0 },   // E+W -> horizontal run middle (thin wall)
	0b1011: { col: 2, row: 0 },   // N+E+W -> T-opens-S (top edge of room)
	0b1100: { col: 3, row: 3 },   // S+W -> inner corner, opens NE
	0b1101: { col: 3, row: 1 },   // N+S+W -> T-opens-E (left edge of room)
	0b1110: { col: 2, row: 3 },   // E+S+W -> T-opens-N (bottom edge of room)
	0b1111: { col: 2, row: 1 },   // all 4 -> 4-way / fully enclosed
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
		const tile = PATTERN_TO_TILE[mask]!;
		const frame = `wat_${tile.col}_${tile.row}`;
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
