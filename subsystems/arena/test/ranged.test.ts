import { describe, expect, test } from "bun:test";
import { pos_c, type Ctx, type Id, type World } from "@f0rbit/forge";
import {
	player_c,
	projectile_c,
	health_c,
	chaser_c,
	dummy_c,
	hitbox_c,
} from "../src/components.ts";
import { hit_events_r } from "../src/resources.ts";
import { make_arena_scenario } from "./fixtures/arena-scenario.ts";
import { spawn_projectile, make_combat_ranged_system } from "../src/systems/combat-ranged.ts";

const fixed_dt = 1 / 60;

type Sim = {
	ctx: Ctx;
	w: World;
	tick: () => void;
};

const make_sim = (): Sim => {
	const scenario = make_arena_scenario({ seed: 42 });
	const h = scenario.h;
	h.schedule.add("update", make_combat_ranged_system(), { phase: 1, name: "combat-ranged" });
	h.time.advance(fixed_dt);
	h.schedule.tick(h.world, h.ctx);
	return {
		ctx: h.ctx,
		w: h.world,
		tick: () => {
			h.time.advance(fixed_dt);
			h.schedule.tick(h.world, h.ctx);
		},
	};
};

const spawn_player = (sim: Sim, x: number, y: number): Id =>
	sim.w.spawn([pos_c, { x, y }], [player_c, true]);

const spawn_dummy = (sim: Sim, x: number, y: number): Id =>
	sim.w.spawn(
		[pos_c, { x, y }],
		[dummy_c, true],
		[hitbox_c, { radius: 6 }],
		[health_c, { current: 100, max: 100 }],
	);

const spawn_chaser = (sim: Sim, x: number, y: number): Id =>
	sim.w.spawn(
		[pos_c, { x, y }],
		[chaser_c, true],
		[hitbox_c, { radius: 4 }],
		[health_c, { current: 1, max: 1 }],
	);

const projectile_count = (sim: Sim): number =>
	sim.w.query([projectile_c] as const).collect().length;

const get_events = (sim: Sim) => {
	const r = sim.ctx.res.get(hit_events_r);
	if (!r.ok) throw new Error("hit_events_r missing");
	return r.value.events;
};

describe("ranged combat", () => {
	test("projectile spawned, moves toward target", () => {
		const sim = make_sim();
		const player_id = spawn_player(sim, 160, 90);
		spawn_dummy(sim, 240, 90);

		spawn_projectile(sim.w, { owner_id: player_id, x: 160, y: 90, dx: 1, dy: 0 });
		expect(projectile_count(sim)).toBe(1);

		// 80px gap at 64 px/sec → ~1.25s = 75 ticks; 90 ticks is a safe margin.
		for (let i = 0; i < 90; i++) sim.tick();

		expect(projectile_count(sim)).toBe(0);
		const events = get_events(sim);
		expect(events.length).toBe(1);
		expect(events[0]!.damage).toBe(1);
	});

	test("projectile despawns on hit (single-target)", () => {
		const sim = make_sim();
		const player_id = spawn_player(sim, 160, 90);
		spawn_chaser(sim, 240, 90);
		spawn_chaser(sim, 320, 90);

		spawn_projectile(sim.w, { owner_id: player_id, x: 160, y: 90, dx: 1, dy: 0 });

		for (let i = 0; i < 120; i++) sim.tick();

		expect(projectile_count(sim)).toBe(0);
		expect(get_events(sim).length).toBe(1);
	});

	test("projectile despawns on boundary", () => {
		const sim = make_sim();
		const player_id = spawn_player(sim, 310, 90);

		spawn_projectile(sim.w, { owner_id: player_id, x: 310, y: 90, dx: 1, dy: 0 });
		expect(projectile_count(sim)).toBe(1);

		// 10px gap at 64 px/sec → ~10 ticks to clear width=320; 20 is a safe margin.
		for (let i = 0; i < 20; i++) sim.tick();

		expect(projectile_count(sim)).toBe(0);
		expect(get_events(sim).length).toBe(0);
	});

	test("owner-filter: projectile cannot damage owner", () => {
		const sim = make_sim();
		// Spawn a chaser to act as the "owner" — i.e. the projectile was fired
		// by this chaser. Even though the chaser sits in the projectile's path
		// with a hitbox, the owner filter should skip it.
		const owner_id = spawn_chaser(sim, 160, 90);

		spawn_projectile(sim.w, { owner_id, x: 160, y: 90, dx: 1, dy: 0 });

		for (let i = 0; i < 30; i++) sim.tick();

		expect(get_events(sim).length).toBe(0);
		// Projectile passes the owner unharmed and continues until boundary.
	});

	test("miss (no collision)", () => {
		const sim = make_sim();
		const player_id = spawn_player(sim, 160, 90);
		spawn_dummy(sim, 160, 150);

		spawn_projectile(sim.w, { owner_id: player_id, x: 160, y: 90, dx: 1, dy: 0 });

		// 160px to right boundary at 64 px/sec → 150 ticks; 200 is a safe margin.
		for (let i = 0; i < 200; i++) sim.tick();

		expect(projectile_count(sim)).toBe(0);
		expect(get_events(sim).length).toBe(0);
	});
});
