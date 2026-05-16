import type { Id, System, World } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { sprite_c } from "@f0rbit/forge/pixi";
import { wall_c } from "../components.ts";
import { g } from "../grid.ts";

const N = 1;
const E = 2;
const S = 4;
const W = 8;

type TilePos = readonly [col: number, row: number];

export const WALL_TILE_BY_PATTERN: Readonly<Record<number, TilePos>> = {
	0: [0, 0],
	[N]: [3, 3],
	[E]: [0, 3],
	[S]: [0, 0],
	[W]: [3, 3],
	[N | E]: [0, 3],
	[N | S]: [0, 1],
	[E | S]: [0, 0],
	[N | W]: [3, 3],
	[E | W]: [1, 3],
	[S | W]: [3, 0],
	[N | E | S]: [0, 1],
	[N | E | W]: [1, 3],
	[N | S | W]: [3, 1],
	[E | S | W]: [1, 0],
	[N | E | S | W]: [1, 1],
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
		const tile = WALL_TILE_BY_PATTERN[mask] ?? [1, 1];
		const frame = `wat_${tile[0]}_${tile[1]}`;
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
