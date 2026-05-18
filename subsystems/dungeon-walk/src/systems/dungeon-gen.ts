import type { Ctx, System, Rng, World } from "@f0rbit/forge";
import { pos_c, rng as make_rng } from "@f0rbit/forge";
import type { Cell } from "@f0rbit/forge/grid";
import { dir_c, exit_c, floor_c, player_c, visual_pos_c, wall_c } from "../components.ts";
import { g } from "../grid.ts";
import { dungeon_r, run_seed_r, score_r } from "../resources.ts";
import { apply_wall_autotile } from "@f0rbit/forge/autotile";

type Room = { x: number; y: number; w: number; h: number };

const room_min = 3;
const room_max = 5;
const room_count = 6;

const random_room = (r: Rng): Room => {
	const w = r.int(room_min, room_max);
	const h = r.int(room_min, room_max);
	const x = r.int(1, g.cols - w - 2);
	const y = r.int(1, g.rows - h - 2);
	return { x, y, w, h };
};

const room_overlaps = (a: Room, b: Room): boolean =>
	a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;

const room_center = (r: Room): Cell => ({
	x: Math.floor(r.x + r.w / 2),
	y: Math.floor(r.y + r.h / 2),
});

const carve_room = (floors: Set<number>, r: Room): void => {
	for (let y = r.y; y < r.y + r.h; y++) {
		for (let x = r.x; x < r.x + r.w; x++) {
			if (g.in_bounds(x, y)) floors.add(g.key(x, y));
		}
	}
};

const carve_h = (floors: Set<number>, x1: number, x2: number, y: number): void => {
	const lo = Math.min(x1, x2);
	const hi = Math.max(x1, x2);
	for (let x = lo; x <= hi; x++) if (g.in_bounds(x, y)) floors.add(g.key(x, y));
};

const carve_v = (floors: Set<number>, y1: number, y2: number, x: number): void => {
	const lo = Math.min(y1, y2);
	const hi = Math.max(y1, y2);
	for (let y = lo; y <= hi; y++) if (g.in_bounds(x, y)) floors.add(g.key(x, y));
};

const carve_corridor = (floors: Set<number>, a: Cell, b: Cell, r: Rng): void => {
	if (r.next() < 0.5) {
		carve_h(floors, a.x, b.x, a.y);
		carve_v(floors, a.y, b.y, b.x);
	} else {
		carve_v(floors, a.y, b.y, a.x);
		carve_h(floors, a.x, b.x, b.y);
	}
};

const generate = (r: Rng): { floors: Set<number>; spawn: Cell; exit: Cell } => {
	const rooms: Room[] = [];
	const floors = new Set<number>();
	let attempts = 0;
	while (rooms.length < room_count && attempts < 200) {
		attempts++;
		const candidate = random_room(r);
		if (rooms.some(rr => room_overlaps(rr, candidate))) continue;
		rooms.push(candidate);
		carve_room(floors, candidate);
		if (rooms.length > 1) {
			const prev = rooms[rooms.length - 2]!;
			carve_corridor(floors, room_center(prev), room_center(candidate), r);
		}
	}
	const first = rooms[0]!;
	const last = rooms[rooms.length - 1]!;
	return { floors, spawn: room_center(first), exit: room_center(last) };
};

export const build_dungeon = (w: World, ctx: Ctx, rng: Rng): void => {
	const { floors, spawn, exit } = generate(rng);

	ctx.res.set(dungeon_r, { cols: g.cols, rows: g.rows, floors, spawn, exit });
	ctx.res.set(score_r, { reached_exit: false });

	const wall_cells = new Set<number>();
	for (let y = 0; y < g.rows; y++) {
		for (let x = 0; x < g.cols; x++) {
			const k = g.key(x, y);
			if (!floors.has(k)) wall_cells.add(k);
		}
	}

	const at = (c: Cell): { x: number; y: number } => g.cell_to_world(c.x, c.y);
	w.spawn_many([...floors].map(k => {
		const p = at(g.unkey(k));
		return [[pos_c, p], [visual_pos_c, { ...p }], [floor_c, true]];
	}));
	w.spawn_many([...wall_cells].map(k => {
		const p = at(g.unkey(k));
		return [[pos_c, p], [visual_pos_c, { ...p }], [floor_c, true]];
	}));
	w.spawn_many([...wall_cells].map(k => {
		const p = at(g.unkey(k));
		return [[pos_c, p], [visual_pos_c, { ...p }], [wall_c, true]];
	}));
	const exit_pos = at(exit);
	w.spawn([pos_c, exit_pos], [visual_pos_c, { ...exit_pos }], [exit_c, true]);
	const spawn_pos = at(spawn);
	w.spawn(
		[pos_c, spawn_pos],
		[visual_pos_c, { ...spawn_pos }],
		[player_c, true],
		[dir_c, { dx: 0, dy: 0 }],
	);
};

export const dungeon_gen_system: System = (w, ctx) => {
	if (ctx.res.has(dungeon_r)) return;
	if (!ctx.res.has(run_seed_r)) ctx.res.set(run_seed_r, { base: ctx.rng.seed, restart_count: 0 });
	build_dungeon(w, ctx, ctx.rng);
};

export const regenerate_dungeon = (w: World, ctx: Ctx): void => {
	const seed = ctx.res.get(run_seed_r);
	const base = seed.ok ? seed.value.base : ctx.rng.seed;
	const restart_count = (seed.ok ? seed.value.restart_count : 0) + 1;
	ctx.res.set(run_seed_r, { base, restart_count });
	build_dungeon(w, ctx, make_rng(base + restart_count));
	apply_wall_autotile(w, { wall_c, texture: "walls", grid: g });
};
