import { describe, expect, test } from "bun:test";
import { pos_c, world } from "@f0rbit/forge";
import { sprite_c } from "@f0rbit/forge/pixi";
import { wall_c } from "../src/components.ts";
import { g } from "../src/grid.ts";
import {
	apply_wall_autotile,
	compute_corner_states,
	CORNER_STATES_TO_TILE,
} from "../src/systems/wall-autotile.ts";
import expected_map from "./fixtures/pattern-to-tile.json";

type Bit = 0 | 1;

const offsets = [
	{ dx: 0, dy: -1 },   // 0  N
	{ dx: 1, dy: -1 },   // 1  NE
	{ dx: 1, dy: 0 },    // 2  E
	{ dx: 1, dy: 1 },    // 3  SE
	{ dx: 0, dy: 1 },    // 4  S
	{ dx: -1, dy: 1 },   // 5  SW
	{ dx: -1, dy: 0 },   // 6  W
	{ dx: -1, dy: -1 },  // 7  NW
] as const;

const neighbors_for_mask = (mask: number, cx: number, cy: number): ReadonlyArray<{ x: number; y: number }> =>
	offsets
		.map((o, i) => ({ o, on: (mask >> i) & 1 }))
		.filter(e => e.on === 1)
		.map(e => ({ x: cx + e.o.dx, y: cy + e.o.dy }));

const spawn_wall = (w: ReturnType<typeof world>, cx: number, cy: number): ReturnType<typeof w.spawn> => {
	const center = g.cell_to_world(cx, cy);
	return w.spawn([pos_c, center], [wall_c, true]);
};

describe("wall autotile (Godot 3x3 minimal, corner-based)", () => {
	test("CORNER_STATES_TO_TILE matches committed fixture (47 entries)", () => {
		const fixture = expected_map as Record<string, { col: number; row: number }>;
		expect(Object.keys(CORNER_STATES_TO_TILE).length).toBe(47);
		expect(Object.keys(fixture).length).toBe(47);
		for (const [k, v] of Object.entries(fixture)) {
			expect(CORNER_STATES_TO_TILE[k as keyof typeof CORNER_STATES_TO_TILE]).toEqual(v);
		}
	});

	test("every 8-neighborhood pattern (256) maps to a known tile", () => {
		const cx = 5;
		const cy = 5;
		const seen_tiles = new Set<string>();
		for (let mask = 0; mask < 256; mask++) {
			const w = world();
			const query_id = spawn_wall(w, cx, cy);
			for (const n of neighbors_for_mask(mask, cx, cy)) spawn_wall(w, n.x, n.y);

			apply_wall_autotile(w);
			const sprite = w.get(query_id, sprite_c);
			expect(sprite.ok).toBe(true);
			if (!sprite.ok) continue;
			const frame = sprite.value.frame;
			expect(frame).toBeDefined();
			expect(frame!).toMatch(/^wat_\d+_\d+$/);
			seen_tiles.add(frame!);
		}
		// Across all 256 raw patterns the 47-tile output set should be covered.
		expect(seen_tiles.size).toBe(47);
	});

	test("compute_corner_states classifies corners using A+B+diagonal", () => {
		// isolated wall: all 4 corners OUTER
		const empty: Bit[][] = [[0, 0, 0], [0, 1, 0], [0, 0, 0]];
		const at = (g: Bit[][]) => (x: number, y: number) => g[y + 1]?.[x + 1] === 1;
		const s_iso = compute_corner_states(0, 0, at(empty));
		expect(s_iso).toEqual({ tl: 0, tr: 0, bl: 0, br: 0 });

		// fully enclosed: all 4 corners FILLED
		const full: Bit[][] = [[1, 1, 1], [1, 1, 1], [1, 1, 1]];
		const s_full = compute_corner_states(0, 0, at(full));
		expect(s_full).toEqual({ tl: 4, tr: 4, bl: 4, br: 4 });

		// N+W only (NW diagonal absent) → TL is CONCAVE; others have only-one-cardinal states
		const nw: Bit[][] = [[0, 1, 0], [1, 1, 0], [0, 0, 0]];
		const s_nw = compute_corner_states(0, 0, at(nw));
		expect(s_nw).toEqual({ tl: 3, tr: 1, bl: 2, br: 0 });
	});
});
