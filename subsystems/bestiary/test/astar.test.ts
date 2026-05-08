import { describe, expect, test } from "bun:test";
import { grid, type Cell } from "@f0rbit/forge/grid";
import { astar } from "../src/astar.ts";

const open_grid = grid({ cols: 10, rows: 10, tile: 16 });
const all_passable = (_c: Cell): boolean => true;

const wall_set = (cells: readonly Cell[]): ((c: Cell) => boolean) => {
	const blocked = new Set(cells.map(c => open_grid.key(c.x, c.y)));
	return (c: Cell): boolean => !blocked.has(open_grid.key(c.x, c.y));
};

describe("astar", () => {
	test("open grid finds straight-line path", () => {
		const path = astar(open_grid, { x: 0, y: 0 }, { x: 3, y: 0 }, { passable: all_passable });
		expect(path).not.toBeNull();
		expect(path!.length).toBe(3);
		expect(path![path!.length - 1]).toEqual({ x: 3, y: 0 });
	});

	test("wall blocks shortest path → finds detour", () => {
		const wall: Cell[] = [
			{ x: 2, y: 0 },
			{ x: 2, y: 1 },
			{ x: 2, y: 2 },
		];
		const passable = wall_set(wall);
		const path = astar(open_grid, { x: 0, y: 0 }, { x: 4, y: 0 }, { passable });
		expect(path).not.toBeNull();
		expect(path!.length).toBeGreaterThan(4);
		for (const cell of path!) expect(passable(cell)).toBe(true);
		expect(path![path!.length - 1]).toEqual({ x: 4, y: 0 });
	});

	test("no path possible returns null", () => {
		const wall: Cell[] = [
			{ x: 1, y: 0 },
			{ x: 1, y: 1 },
			{ x: 0, y: 1 },
		];
		const passable = wall_set(wall);
		const path = astar(open_grid, { x: 0, y: 0 }, { x: 5, y: 5 }, { passable });
		expect(path).toBeNull();
	});

	test("same start and end returns empty array", () => {
		const path = astar(open_grid, { x: 3, y: 3 }, { x: 3, y: 3 }, { passable: all_passable });
		expect(path).not.toBeNull();
		expect(path!.length).toBe(0);
	});

	test("determinism: identical input produces identical output", () => {
		const a = astar(open_grid, { x: 0, y: 0 }, { x: 5, y: 5 }, { passable: all_passable });
		const b = astar(open_grid, { x: 0, y: 0 }, { x: 5, y: 5 }, { passable: all_passable });
		expect(a).not.toBeNull();
		expect(b).not.toBeNull();
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});

	test("4-neighbor path uses Manhattan distance — no diagonals", () => {
		const path = astar(open_grid, { x: 0, y: 0 }, { x: 3, y: 3 }, { passable: all_passable });
		expect(path).not.toBeNull();
		expect(path!.length).toBe(6);
		for (let i = 1; i < path!.length; i++) {
			const a = path![i - 1]!;
			const b = path![i]!;
			const dx = Math.abs(a.x - b.x);
			const dy = Math.abs(a.y - b.y);
			expect(dx + dy).toBe(1);
		}
	});

	test("8-neighbor path uses Chebyshev — diagonals allowed", () => {
		const path = astar(open_grid, { x: 0, y: 0 }, { x: 3, y: 3 }, {
			passable: all_passable,
			neighbors: "8",
		});
		expect(path).not.toBeNull();
		expect(path!.length).toBe(3);
	});

	test("max_steps cutoff returns null when budget exceeded", () => {
		const path = astar(open_grid, { x: 0, y: 0 }, { x: 9, y: 9 }, {
			passable: all_passable,
			max_steps: 3,
		});
		expect(path).toBeNull();
	});
});
