// FORGE-PROMOTION-CANDIDATE: copied verbatim from
// subsystems/bestiary/src/astar.ts. progress is the 2nd consumer
// of this pattern (boss Phase 6 will be the 3rd). Phase 8 (`main`)
// should extract to @f0rbit/forge per AGENTS.md §5 promotion criteria.
//
// If you edit this file, sync the change back to bestiary's copy
// (and forward to any other copy that exists). Annotated 2026-05-18.
import type { Cell, Grid } from "@f0rbit/forge/grid";

export type AstarOpts = {
	passable: (cell: Cell) => boolean;
	max_steps?: number;
	neighbors?: "4" | "8";
};

type Node = { key: number; f: number; g: number; h: number };

const heap_push = (heap: Node[], node: Node): void => {
	heap.push(node);
	let i = heap.length - 1;
	while (i > 0) {
		const parent = (i - 1) >> 1;
		if (compare(heap[i]!, heap[parent]!) < 0) {
			[heap[i], heap[parent]] = [heap[parent]!, heap[i]!];
			i = parent;
		} else break;
	}
};

const heap_pop = (heap: Node[]): Node | undefined => {
	if (heap.length === 0) return undefined;
	const top = heap[0]!;
	const last = heap.pop()!;
	if (heap.length === 0) return top;
	heap[0] = last;
	let i = 0;
	for (;;) {
		const l = i * 2 + 1;
		const r = l + 1;
		let best = i;
		if (l < heap.length && compare(heap[l]!, heap[best]!) < 0) best = l;
		if (r < heap.length && compare(heap[r]!, heap[best]!) < 0) best = r;
		if (best === i) break;
		[heap[i], heap[best]] = [heap[best]!, heap[i]!];
		i = best;
	}
	return top;
};

const compare = (a: Node, b: Node): number =>
	a.f !== b.f ? a.f - b.f : a.h !== b.h ? a.h - b.h : a.key - b.key;

export const astar = (
	grid: Grid,
	from: Cell,
	to: Cell,
	opts: AstarOpts,
): readonly Cell[] | null => {
	const max_steps = opts.max_steps ?? 1000;
	const use_8 = opts.neighbors === "8";
	const heuristic = use_8 ? grid.chebyshev : grid.manhattan;

	const from_key = grid.key(from.x, from.y);
	const to_key = grid.key(to.x, to.y);
	if (from_key === to_key) return [];
	if (!opts.passable(to)) return null;

	const open: Node[] = [];
	const came_from = new Map<number, number>();
	const g_score = new Map<number, number>();
	g_score.set(from_key, 0);
	heap_push(open, { key: from_key, f: heuristic(from, to), g: 0, h: heuristic(from, to) });

	let steps = 0;
	while (open.length > 0 && steps < max_steps) {
		steps++;
		const cur = heap_pop(open)!;
		if (cur.key === to_key) {
			const path: Cell[] = [];
			let k = to_key;
			while (k !== from_key) {
				path.push(grid.unkey(k));
				k = came_from.get(k)!;
			}
			path.reverse();
			return path;
		}
		const cur_cell = grid.unkey(cur.key);
		const cur_g = g_score.get(cur.key)!;
		const neighbors = use_8 ? grid.neighbors8(cur_cell.x, cur_cell.y) : grid.neighbors4(cur_cell.x, cur_cell.y);
		for (const n of neighbors) {
			if (!opts.passable(n)) continue;
			const n_key = grid.key(n.x, n.y);
			const tentative = cur_g + 1;
			const prev = g_score.get(n_key);
			if (prev !== undefined && tentative >= prev) continue;
			came_from.set(n_key, cur.key);
			g_score.set(n_key, tentative);
			const h = heuristic(n, to);
			heap_push(open, { key: n_key, f: tentative + h, g: tentative, h });
		}
	}
	return null;
};
