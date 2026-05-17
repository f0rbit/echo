import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { floor_c, visual_pos_c, wall_c } from "../components.ts";
import { g } from "../grid.ts";
import { dungeon_r } from "../resources.ts";

export const debug_arena_gen_system: System = (w, ctx) => {
	const wall_cells = new Set<number>();
	const place_wall = (x: number, y: number): void => {
		if (!g.in_bounds(x, y)) return;
		wall_cells.add(g.key(x, y));
	};

	// pattern 0x0 (isolated) — row 1, all interior (no OOB neighbours)
	place_wall(1, 1);
	place_wall(4, 1);
	place_wall(7, 1);
	place_wall(9, 1);

	// "+" cross at (4,5) — covers caps 0x1/0x2/0x4/0x8, runs 0x5/0xA, centre 0xF
	for (let y = 3; y <= 7; y++) place_wall(4, y);
	for (let x = 1; x <= 7; x++) place_wall(x, 5);

	// 4x4 hollow room at (12-15, 3-6) — covers corners 0x3/0x6/0x9/0xC plus sides 0x5/0xA
	for (let x = 12; x <= 15; x++) {
		place_wall(x, 3);
		place_wall(x, 6);
	}
	for (let y = 4; y <= 5; y++) {
		place_wall(12, y);
		place_wall(15, y);
	}

	// T-down (joint = 0xE) — horiz (1-3, 8) + stem (2, 9)
	for (let x = 1; x <= 3; x++) place_wall(x, 8);
	place_wall(2, 9);

	// T-up (joint = 0xB) — horiz (6-8, 9) + stem (7, 8)
	for (let x = 6; x <= 8; x++) place_wall(x, 9);
	place_wall(7, 8);

	// T-right (joint = 0x7) — vert (11, 7-9) + stem (12, 8)
	for (let y = 7; y <= 9; y++) place_wall(11, y);
	place_wall(12, 8);

	// T-left (joint = 0xD) — vert (17, 7-9) + stem (16, 8)
	for (let y = 7; y <= 9; y++) place_wall(17, y);
	place_wall(16, 8);

	// floors everywhere visible — including under walls so transparent sprites show backing
	const all_floor_cells = new Set<number>();
	for (let y = 0; y < g.rows; y++) {
		for (let x = 0; x < g.cols; x++) {
			all_floor_cells.add(g.key(x, y));
		}
	}

	w.spawn_many([...all_floor_cells].map(k => {
		const c = g.unkey(k);
		const p = g.cell_to_world(c.x, c.y);
		return [[pos_c, p], [visual_pos_c, { ...p }], [floor_c, true]];
	}));

	w.spawn_many([...wall_cells].map(k => {
		const c = g.unkey(k);
		const p = g.cell_to_world(c.x, c.y);
		return [[pos_c, p], [visual_pos_c, { ...p }], [wall_c, true]];
	}));

	ctx.res.set(dungeon_r, {
		cols: g.cols,
		rows: g.rows,
		floors: all_floor_cells,
		spawn: { x: 0, y: 0 },
		exit: { x: 0, y: 0 },
	});

	console.log(`debug fixture: ${wall_cells.size} walls + ${all_floor_cells.size} floors spawned`);
	console.log("layout: pattern-0 isolates row 1; '+' cross at (4,5); 4x4 room (12-15, 3-6); 4 T-junctions row 7-9");
};
