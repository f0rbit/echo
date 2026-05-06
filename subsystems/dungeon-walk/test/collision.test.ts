import { describe, expect, test } from "bun:test";
import { harness, pos_c, type Ctx, type World } from "@f0rbit/forge";
import { presets } from "@f0rbit/forge/presets";
import { game_plugin } from "../src/plugin.ts";
import { dungeon_r } from "../src/resources.ts";
import { player_c } from "../src/components.ts";
import { cell_to_world, key, world_to_cell } from "../src/grid.ts";
import { step_every } from "../src/systems/movement.ts";

const seed = 42;
const fixed_dt = 1 / 60;

type Sim = {
	ctx: Ctx;
	w: World;
	tick: () => void;
	inject: (dx: number, dy: number) => void;
};

const make_sim = (): Sim => {
	const h = harness({ seed, fixed_dt, bindings: presets.movement2d });
	game_plugin(h.world, h.schedule);
	h.time.advance(fixed_dt);
	h.schedule.tick(h.world, h.ctx);
	return {
		ctx: h.ctx,
		w: h.world,
		tick: () => {
			h.time.advance(fixed_dt);
			h.schedule.tick(h.world, h.ctx);
		},
		inject: (dx, dy) =>
			h.input.inject_actions([
				{ kind: "axis", action: "move.x", value: dx },
				{ kind: "axis", action: "move.y", value: dy },
			]),
	};
};

const player_cell = (sim: Sim): { x: number; y: number } => {
	const players = sim.w.query([pos_c, player_c] as const).collect();
	const p = players[0]![1];
	return world_to_cell(p.x, p.y);
};

const find_open_neighbor = (
	floors: ReadonlySet<number>,
	cx: number,
	cy: number,
): { dx: number; dy: number } | null => {
	const dirs = [
		{ dx: 1, dy: 0 },
		{ dx: -1, dy: 0 },
		{ dx: 0, dy: 1 },
		{ dx: 0, dy: -1 },
	];
	for (const d of dirs) if (floors.has(key(cx + d.dx, cy + d.dy))) return d;
	return null;
};

const walk_until_wall_adjacent = (
	sim: Sim,
	floors: ReadonlySet<number>,
	dir: { dx: number; dy: number },
	max_steps: number,
): { x: number; y: number } => {
	sim.inject(dir.dx, dir.dy);
	for (let i = 0; i < max_steps * step_every; i++) {
		sim.tick();
		const c = player_cell(sim);
		if (!floors.has(key(c.x + dir.dx, c.y + dir.dy))) return c;
	}
	return player_cell(sim);
};

describe("dungeon-walk collision", () => {
	test("pushing into a wall does not move the player", () => {
		const sim = make_sim();
		const d = sim.ctx.res.get(dungeon_r);
		expect(d.ok).toBe(true);
		if (!d.ok) return;
		const floors = d.value.floors;
		const dirs = [
			{ dx: 1, dy: 0 },
			{ dx: -1, dy: 0 },
			{ dx: 0, dy: 1 },
			{ dx: 0, dy: -1 },
		];
		const wall_dir = dirs.find(dr => {
			const start = player_cell(sim);
			let cx = start.x;
			let cy = start.y;
			for (let i = 0; i < 50; i++) {
				if (!floors.has(key(cx + dr.dx, cy + dr.dy))) return true;
				if (!floors.has(key(cx + dr.dx, cy + dr.dy))) return true;
				cx += dr.dx;
				cy += dr.dy;
			}
			return false;
		});
		expect(wall_dir).toBeDefined();
		if (!wall_dir) return;

		const at_wall = walk_until_wall_adjacent(sim, floors, wall_dir, 50);
		expect(floors.has(key(at_wall.x + wall_dir.dx, at_wall.y + wall_dir.dy))).toBe(false);
		const before = at_wall;
		sim.inject(wall_dir.dx, wall_dir.dy);
		for (let i = 0; i < step_every * 5; i++) sim.tick();
		const after = player_cell(sim);
		expect(after).toEqual(before);
	});

	test("pushing into an open neighbour moves the player", () => {
		const sim = make_sim();
		const d = sim.ctx.res.get(dungeon_r);
		expect(d.ok).toBe(true);
		if (!d.ok) return;
		const start = player_cell(sim);
		const open = find_open_neighbor(d.value.floors, start.x, start.y);
		expect(open).not.toBeNull();
		if (!open) return;
		sim.inject(open.dx, open.dy);
		for (let i = 0; i < step_every * 2; i++) sim.tick();
		const after = player_cell(sim);
		expect(after).not.toEqual(start);
	});

	test("diagonal input slides along a wall instead of clipping through", () => {
		const sim = make_sim();
		const d = sim.ctx.res.get(dungeon_r);
		expect(d.ok).toBe(true);
		if (!d.ok) return;
		const floors = d.value.floors;
		const dirs = [
			{ dx: 1, dy: 0 },
			{ dx: -1, dy: 0 },
			{ dx: 0, dy: 1 },
			{ dx: 0, dy: -1 },
		];
		const wall_dir = dirs.find(dr => {
			const start = player_cell(sim);
			let cx = start.x;
			let cy = start.y;
			for (let i = 0; i < 50; i++) {
				if (!floors.has(key(cx + dr.dx, cy + dr.dy))) return true;
				cx += dr.dx;
				cy += dr.dy;
			}
			return false;
		});
		if (!wall_dir) return;
		const at_wall = walk_until_wall_adjacent(sim, floors, wall_dir, 50);

		const along = dirs.find(
			dr =>
				(dr.dx !== wall_dir.dx || dr.dy !== wall_dir.dy) &&
				(dr.dx !== -wall_dir.dx || dr.dy !== -wall_dir.dy) &&
				floors.has(key(at_wall.x + dr.dx, at_wall.y + dr.dy)),
		);
		if (!along) return;

		sim.inject(along.dx + wall_dir.dx, along.dy + wall_dir.dy);
		for (let i = 0; i < step_every; i++) sim.tick();
		const after = player_cell(sim);
		expect(after.x).toBe(at_wall.x + along.dx);
		expect(after.y).toBe(at_wall.y + along.dy);
	});

	test("player position is centered on the cell after movement", () => {
		const sim = make_sim();
		const d = sim.ctx.res.get(dungeon_r);
		if (!d.ok) return;
		const start = player_cell(sim);
		const open = find_open_neighbor(d.value.floors, start.x, start.y);
		if (!open) return;
		sim.inject(open.dx, open.dy);
		for (let i = 0; i < step_every; i++) sim.tick();
		const players = sim.w.query([pos_c, player_c] as const).collect();
		const p = players[0]![1];
		const expected = cell_to_world(start.x + open.dx, start.y + open.dy);
		expect(p.x).toBe(expected.x);
		expect(p.y).toBe(expected.y);
	});
});
