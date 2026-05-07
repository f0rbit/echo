import { describe, expect, test } from "bun:test";
import { harness, pos_c, type Ctx, type World } from "@f0rbit/forge";
import { game_bindings } from "../src/bindings.ts";
import { game_plugin } from "../src/plugin.ts";
import { dungeon_r, run_seed_r, score_r } from "../src/resources.ts";
import { floor_c, player_c } from "../src/components.ts";
import { cell_to_world, key, world_to_cell } from "../src/grid.ts";
import { step_every } from "../src/systems/movement.ts";

const seed = 42;
const fixed_dt = 1 / 60;

type Sim = {
	ctx: Ctx;
	w: World;
	tick: () => void;
	inject_axes: (dx: number, dy: number) => void;
	press_restart: () => void;
};

const make_sim = (): Sim => {
	const h = harness({ seed, fixed_dt, bindings: game_bindings });
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
		inject_axes: (dx, dy) =>
			h.input.inject_actions([
				{ kind: "axis", action: "move.x", value: dx },
				{ kind: "axis", action: "move.y", value: dy },
			]),
		press_restart: () =>
			h.input.inject_actions([{ kind: "press", action: "restart" }]),
	};
};

const teleport_player = (sim: Sim, x: number, y: number): void => {
	const players = sim.w.query([pos_c, player_c] as const).collect();
	const id = players[0]![0];
	const w = cell_to_world(x, y);
	sim.w.set(id, pos_c, { x: w.x, y: w.y });
};

const player_cell = (sim: Sim): { x: number; y: number } => {
	const players = sim.w.query([pos_c, player_c] as const).collect();
	const p = players[0]![1];
	return world_to_cell(p.x, p.y);
};

describe("dungeon-walk restart", () => {
	test("pressing restart clears reached_exit and respawns the player", () => {
		const sim = make_sim();
		const d = sim.ctx.res.get(dungeon_r);
		expect(d.ok).toBe(true);
		if (!d.ok) return;
		const { exit, floors } = d.value;
		const adj = [
			{ dx: 1, dy: 0 },
			{ dx: -1, dy: 0 },
			{ dx: 0, dy: 1 },
			{ dx: 0, dy: -1 },
		].find(dr => floors.has(key(exit.x - dr.dx, exit.y - dr.dy)));
		expect(adj).toBeDefined();
		if (!adj) return;
		teleport_player(sim, exit.x - adj.dx, exit.y - adj.dy);
		sim.inject_axes(adj.dx, adj.dy);
		for (let i = 0; i < step_every; i++) sim.tick();
		const before = sim.ctx.res.get(score_r);
		expect(before.ok && before.value.reached_exit).toBe(true);

		sim.inject_axes(0, 0);
		sim.press_restart();
		sim.tick();

		const after = sim.ctx.res.get(score_r);
		expect(after.ok && after.value.reached_exit).toBe(false);
		const d2 = sim.ctx.res.get(dungeon_r);
		expect(d2.ok).toBe(true);
		if (!d2.ok) return;
		expect(d2.value.floors.size).toBeGreaterThan(0);
		const players = sim.w.query([pos_c, player_c] as const).collect();
		expect(players.length).toBe(1);
		expect(player_cell(sim)).toEqual(d2.value.spawn);
	});

	test("restart bumps run_seed.restart_count and produces a fresh dungeon", () => {
		const sim = make_sim();
		const before = sim.ctx.res.get(dungeon_r);
		expect(before.ok).toBe(true);
		if (!before.ok) return;
		const before_floors = new Set(before.value.floors);
		const before_spawn = { ...before.value.spawn };

		sim.press_restart();
		sim.tick();

		const seed_res = sim.ctx.res.get(run_seed_r);
		expect(seed_res.ok).toBe(true);
		if (seed_res.ok) {
			expect(seed_res.value.base).toBe(seed);
			expect(seed_res.value.restart_count).toBe(1);
		}

		const after = sim.ctx.res.get(dungeon_r);
		expect(after.ok).toBe(true);
		if (!after.ok) return;
		const same_layout =
			after.value.floors.size === before_floors.size &&
			after.value.spawn.x === before_spawn.x &&
			after.value.spawn.y === before_spawn.y &&
			[...after.value.floors].every(k => before_floors.has(k));
		expect(same_layout).toBe(false);
	});

	test("restart cleans up old entities — no duplicate players or floors", () => {
		const sim = make_sim();
		const before = sim.w.query([floor_c] as const).collect().length;
		const before_players = sim.w.query([player_c] as const).collect().length;
		expect(before_players).toBe(1);

		sim.press_restart();
		sim.tick();

		const after_players = sim.w.query([player_c] as const).collect().length;
		const after = sim.w.query([floor_c] as const).collect().length;
		expect(after_players).toBe(1);
		expect(after).toBeGreaterThan(0);
		expect(after).toBeLessThanOrEqual(before * 2);
	});
});
