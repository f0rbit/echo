import type { Ctx, System, Rng, Id, World } from "@f0rbit/forge";
import { pos_c, rng as make_rng } from "@f0rbit/forge";
import { dir_c, exit_c, floor_c, player_c } from "../components.ts";
import { cell_index_r, dungeon_r, run_seed_r, score_r, type Cell } from "../resources.ts";
import { cell_to_world, cols, in_bounds, key, rows } from "../grid.ts";

type Room = { x: number; y: number; w: number; h: number };

const room_min = 3;
const room_max = 5;
const room_count = 6;

const random_room = (r: Rng): Room => {
	const w = r.int(room_min, room_max);
	const h = r.int(room_min, room_max);
	const x = r.int(1, cols - w - 2);
	const y = r.int(1, rows - h - 2);
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
			if (in_bounds(x, y)) floors.add(key(x, y));
		}
	}
};

const carve_corridor = (floors: Set<number>, a: Cell, b: Cell, r: Rng): void => {
	const horizontal_first = r.next() < 0.5;
	if (horizontal_first) {
		carve_h(floors, a.x, b.x, a.y);
		carve_v(floors, a.y, b.y, b.x);
	} else {
		carve_v(floors, a.y, b.y, a.x);
		carve_h(floors, a.x, b.x, b.y);
	}
};

const carve_h = (floors: Set<number>, x1: number, x2: number, y: number): void => {
	const lo = Math.min(x1, x2);
	const hi = Math.max(x1, x2);
	for (let x = lo; x <= hi; x++) if (in_bounds(x, y)) floors.add(key(x, y));
};

const carve_v = (floors: Set<number>, y1: number, y2: number, x: number): void => {
	const lo = Math.min(y1, y2);
	const hi = Math.max(y1, y2);
	for (let y = lo; y <= hi; y++) if (in_bounds(x, y)) floors.add(key(x, y));
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

	ctx.res.set(dungeon_r, { cols, rows, floors, spawn, exit });
	ctx.res.set(score_r, { reached_exit: false });

	const floor_at = new Map<number, Id>();
	for (const k of floors) {
		const cell = { x: k % cols, y: Math.floor(k / cols) };
		const world = cell_to_world(cell.x, cell.y);
		const id = w.spawn([pos_c, { x: world.x, y: world.y }], [floor_c, true]);
		floor_at.set(k, id);
	}

	const exit_world = cell_to_world(exit.x, exit.y);
	const exit_id = w.spawn([pos_c, { x: exit_world.x, y: exit_world.y }], [exit_c, true]);

	const spawn_world = cell_to_world(spawn.x, spawn.y);
	w.spawn(
		[pos_c, { x: spawn_world.x, y: spawn_world.y }],
		[player_c, true],
		[dir_c, { dx: 0, dy: 0 }],
	);

	ctx.res.set(cell_index_r, { floor_at, exit_id });
};

export const dungeon_gen_system: System = (w, ctx) => {
	if (ctx.res.has(dungeon_r)) return;
	if (!ctx.res.has(run_seed_r)) {
		ctx.res.set(run_seed_r, { base: ctx.rng.seed, restart_count: 0 });
	}
	build_dungeon(w, ctx, ctx.rng);
};

export const regenerate_dungeon = (w: World, ctx: Ctx): void => {
	const seed = ctx.res.get(run_seed_r);
	const base = seed.ok ? seed.value.base : ctx.rng.seed;
	const next_count = seed.ok ? seed.value.restart_count + 1 : 1;
	ctx.res.set(run_seed_r, { base, restart_count: next_count });
	const fresh = make_rng(base + next_count);
	build_dungeon(w, ctx, fresh);
};
