import { describe, expect, test } from "bun:test";
import { harness, pos_c, type Ctx, type World } from "@f0rbit/forge";
import { game_bindings } from "../src/bindings.ts";
import {
	chaser_c,
	minion_c,
	patroller_c,
	player_c,
	ranged_c,
	summoner_c,
} from "../src/components.ts";
import { g } from "../src/grid.ts";
import { game_plugin } from "../src/plugin.ts";
import { run_seed_r } from "../src/resources.ts";

const fixed_dt = 1 / 60;
const seed = 42;

type Sim = { ctx: Ctx; w: World; tick: () => void; press_restart: () => void };

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
		press_restart: () => {
			h.input.inject_actions([{ kind: "press", action: "restart" }]);
			h.time.advance(fixed_dt);
			h.schedule.tick(h.world, h.ctx);
			h.input.inject_actions([{ kind: "release", action: "restart" }]);
			h.time.advance(fixed_dt);
			h.schedule.tick(h.world, h.ctx);
		},
	};
};

describe("restart", () => {
	test("R press despawns all entities and respawns the arena", () => {
		const sim = make_sim();
		const before = sim.w.count();
		expect(before).toBeGreaterThan(0);
		expect(sim.w.query([player_c] as const).collect().length).toBe(1);
		sim.press_restart();
		expect(sim.w.query([player_c] as const).collect().length).toBe(1);
		expect(sim.w.query([chaser_c] as const).collect().length).toBeGreaterThanOrEqual(2);
		expect(sim.w.query([patroller_c] as const).collect().length).toBe(1);
		expect(sim.w.query([ranged_c] as const).collect().length).toBe(1);
		expect(sim.w.query([summoner_c] as const).collect().length).toBe(1);
	});

	test("restart_count increments and seed bumps each restart", () => {
		const sim = make_sim();
		const r0 = sim.ctx.res.get(run_seed_r);
		expect(r0.ok).toBe(true);
		if (!r0.ok) return;
		expect(r0.value.restart_count).toBe(0);
		sim.press_restart();
		const r1 = sim.ctx.res.get(run_seed_r);
		expect(r1.ok).toBe(true);
		if (!r1.ok) return;
		expect(r1.value.restart_count).toBe(1);
		sim.press_restart();
		const r2 = sim.ctx.res.get(run_seed_r);
		expect(r2.ok).toBe(true);
		if (!r2.ok) return;
		expect(r2.value.restart_count).toBe(2);
	});

	test("restart clears spawned minions", () => {
		const sim = make_sim();
		const players = sim.w.query([pos_c, player_c] as const).collect();
		const pid = players[0]![0];
		sim.w.set(pid, pos_c, g.cell_to_world(1, 1));
		for (let i = 0; i < 200; i++) sim.tick();
		expect(sim.w.query([minion_c] as const).collect().length).toBeGreaterThanOrEqual(1);
		sim.press_restart();
		expect(sim.w.query([minion_c] as const).collect().length).toBe(0);
	});
});
