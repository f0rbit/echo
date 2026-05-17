import { describe, expect, test } from "bun:test";
import { pos_c, world } from "@f0rbit/forge";
import { sprite_c } from "@f0rbit/forge/pixi";
import { wall_c } from "../src/components.ts";
import { g } from "../src/grid.ts";
import { apply_wall_autotile, PATTERN_TO_TILE } from "../src/systems/wall-autotile.ts";
import expected_map from "./fixtures/pattern-to-tile.json";

const N = 1;
const E = 2;
const S = 4;
const W = 8;

const dir_offsets: ReadonlyArray<{ mask: number; dx: number; dy: number }> = [
	{ mask: N, dx: 0, dy: -1 },
	{ mask: E, dx: 1, dy: 0 },
	{ mask: S, dx: 0, dy: 1 },
	{ mask: W, dx: -1, dy: 0 },
];

const neighbor_cells = (pattern: number, cx: number, cy: number): ReadonlyArray<{ x: number; y: number }> =>
	dir_offsets
		.filter(d => (pattern & d.mask) !== 0)
		.map(d => ({ x: cx + d.dx, y: cy + d.dy }));

const spawn_wall = (w: ReturnType<typeof world>, cx: number, cy: number): ReturnType<typeof w.spawn> => {
	const center = g.cell_to_world(cx, cy);
	return w.spawn([pos_c, center], [wall_c, true]);
};

describe("wall autotile", () => {
	test("PATTERN_TO_TILE matches committed fixture", () => {
		for (let i = 0; i < 16; i++) {
			const tile = PATTERN_TO_TILE[i]!;
			const expected = (expected_map as Record<string, { col: number; row: number }>)[String(i)]!;
			expect(tile).toEqual(expected);
		}
	});

	test("assigns expected frame for each of the 16 neighbor patterns", () => {
		const cx = 5;
		const cy = 5;
		for (let pattern = 0; pattern < 16; pattern++) {
			const w = world();
			const query_id = spawn_wall(w, cx, cy);
			for (const n of neighbor_cells(pattern, cx, cy)) spawn_wall(w, n.x, n.y);

			apply_wall_autotile(w);

			const sprite = w.get(query_id, sprite_c);
			expect(sprite.ok).toBe(true);
			if (!sprite.ok) continue;
			const tile = PATTERN_TO_TILE[pattern]!;
			const expected_frame = `wat_${tile.col}_${tile.row}`;
			expect(sprite.value.frame).toBe(expected_frame);
		}
	});
});
