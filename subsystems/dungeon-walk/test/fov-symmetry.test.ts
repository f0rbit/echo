import { describe, expect, test } from "bun:test";
import { g } from "../src/grid.ts";

type Cell = { x: number; y: number };

const eye_radius = 6;

const euclidean = (a: Cell, b: Cell): number =>
	Math.hypot(a.x - b.x, a.y - b.y);

const eye_cells_reached = (px: number, py: number, floors: ReadonlySet<number>): ReadonlySet<number> => {
	const los_set = g.line_of_sight({
		from: { x: px, y: py },
		radius: eye_radius,
		is_blocking: (c: Cell) => !floors.has(g.key(c.x, c.y)),
	});
	const circular = new Set<number>();
	for (const key of los_set) {
		const c = g.unkey(key);
		if (euclidean(c, { x: px, y: py }) <= eye_radius) {
			circular.add(key);
		}
	}
	return circular;
};

const rect_floors = (x0: number, y0: number, x1: number, y1: number): Set<number> => {
	const s = new Set<number>();
	for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) s.add(g.key(x, y));
	return s;
};

const remove_walls = (floors: Set<number>, walls: readonly Cell[]): Set<number> => {
	for (const w of walls) floors.delete(g.key(w.x, w.y));
	return floors;
};

describe("eye-light visibility symmetry", () => {
	test("two cells on a clear floor see each other reciprocally", () => {
		const floors = rect_floors(0, 0, g.cols - 1, g.rows - 1);
		const a: Cell = { x: 5, y: 5 };
		const b: Cell = { x: 9, y: 8 };
		const from_a = eye_cells_reached(a.x, a.y, floors);
		const from_b = eye_cells_reached(b.x, b.y, floors);
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
			const va = eye_cells_reached(a.x, a.y, floors);
			for (const b of cells) {
				if (a === b) continue;
				const vb = eye_cells_reached(b.x, b.y, floors);
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
		const from_left = eye_cells_reached(left.x, left.y, floors);
		const from_right = eye_cells_reached(right.x, right.y, floors);
		expect(from_left.has(g.key(right.x, right.y))).toBe(false);
		expect(from_right.has(g.key(left.x, left.y))).toBe(false);
	});

	test("cells outside eye_radius are filtered to circular boundary", () => {
		const cx = Math.floor(g.cols / 2);
		const cy = Math.floor(g.rows / 2);
		const floors = rect_floors(0, 0, g.cols - 1, g.rows - 1);
		const seen = eye_cells_reached(cx, cy, floors);
		for (let y = 0; y < g.rows; y++) {
			for (let x = 0; x < g.cols; x++) {
				const dist = euclidean({ x, y }, { x: cx, y: cy });
				if (dist > eye_radius && seen.has(g.key(x, y))) {
					throw new Error(`cell (${x},${y}) outside radius is visible`);
				}
			}
		}
		expect(seen.has(g.key(cx, cy))).toBe(true);
	});

	test("the player's own cell is always visible", () => {
		const floors = rect_floors(0, 0, 5, 5);
		const seen = eye_cells_reached(2, 2, floors);
		expect(seen.has(g.key(2, 2))).toBe(true);
	});
});
