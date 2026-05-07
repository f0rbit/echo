import { describe, expect, test } from "bun:test";
import { g } from "../src/grid.ts";

type Cell = { x: number; y: number };

const fov_radius = 6;

const visible_keys = (px: number, py: number, floors: ReadonlySet<number>): ReadonlySet<number> =>
	g.line_of_sight({
		from: { x: px, y: py },
		radius: fov_radius,
		is_blocking: (c: Cell) => !floors.has(g.key(c.x, c.y)),
	});

const rect_floors = (x0: number, y0: number, x1: number, y1: number): Set<number> => {
	const s = new Set<number>();
	for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) s.add(g.key(x, y));
	return s;
};

const remove_walls = (floors: Set<number>, walls: readonly Cell[]): Set<number> => {
	for (const w of walls) floors.delete(g.key(w.x, w.y));
	return floors;
};

describe("fov visibility symmetry", () => {
	test("two cells on a clear floor see each other reciprocally", () => {
		const floors = rect_floors(0, 0, g.cols - 1, g.rows - 1);
		const a: Cell = { x: 5, y: 5 };
		const b: Cell = { x: 9, y: 8 };
		const from_a = visible_keys(a.x, a.y, floors);
		const from_b = visible_keys(b.x, b.y, floors);
		expect(from_a.has(g.key(b.x, b.y))).toBe(true);
		expect(from_b.has(g.key(a.x, a.y))).toBe(true);
	});

	test("symmetry holds for every cell pair within radius on open floor", () => {
		const floors = rect_floors(0, 0, g.cols - 1, g.rows - 1);
		const cells: Cell[] = [
			{ x: 7, y: 5 },
			{ x: 4, y: 5 },
			{ x: 10, y: 5 },
			{ x: 7, y: 3 },
			{ x: 7, y: 8 },
			{ x: 4, y: 3 },
			{ x: 10, y: 8 },
			{ x: 4, y: 8 },
			{ x: 10, y: 3 },
		];
		for (const a of cells) {
			const va = visible_keys(a.x, a.y, floors);
			for (const b of cells) {
				if (a === b) continue;
				const vb = visible_keys(b.x, b.y, floors);
				const a_sees_b = va.has(g.key(b.x, b.y));
				const b_sees_a = vb.has(g.key(a.x, a.y));
				expect(a_sees_b).toBe(b_sees_a);
			}
		}
	});

	test("a wall blocks from both sides — mirrored players agree on hidden cells", () => {
		const floors = remove_walls(rect_floors(0, 0, g.cols - 1, g.rows - 1), [
			{ x: 10, y: 5 },
			{ x: 10, y: 4 },
			{ x: 10, y: 6 },
		]);
		const left: Cell = { x: 8, y: 5 };
		const right: Cell = { x: 12, y: 5 };
		const from_left = visible_keys(left.x, left.y, floors);
		const from_right = visible_keys(right.x, right.y, floors);
		expect(from_left.has(g.key(right.x, right.y))).toBe(false);
		expect(from_right.has(g.key(left.x, left.y))).toBe(false);
	});

	test("cells outside fov_radius are never visible (chebyshev bound)", () => {
		const cx = Math.floor(g.cols / 2);
		const cy = Math.floor(g.rows / 2);
		const floors = rect_floors(0, 0, g.cols - 1, g.rows - 1);
		const seen = visible_keys(cx, cy, floors);
		for (let y = 0; y < g.rows; y++) {
			for (let x = 0; x < g.cols; x++) {
				const cheb = Math.max(Math.abs(x - cx), Math.abs(y - cy));
				if (cheb > fov_radius && seen.has(g.key(x, y))) {
					throw new Error(`cell (${x},${y}) outside radius is visible`);
				}
			}
		}
		expect(seen.has(g.key(cx, cy))).toBe(true);
	});

	test("the player's own cell is always visible", () => {
		const floors = rect_floors(0, 0, 5, 5);
		const seen = visible_keys(2, 2, floors);
		expect(seen.has(g.key(2, 2))).toBe(true);
	});
});
