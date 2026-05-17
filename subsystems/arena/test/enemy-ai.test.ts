import { describe, expect, test } from "bun:test";
import { pos_c, type Ctx, type Id, type World } from "@f0rbit/forge";
import { chaser_c, player_c, vel_c, health_c, hitbox_c } from "../src/components.ts";
import { hit_events_r, wave_r } from "../src/resources.ts";
import { make_arena_scenario } from "./fixtures/arena-scenario.ts";
import { make_enemy_ai_system } from "../src/systems/enemy-ai.ts";

type Sim = { w: World; ctx: Ctx; tick: () => void };

const make_sim = (): Sim => {
	const scenario = make_arena_scenario({ seed: 42 });
	const h = scenario.h;
	h.schedule.add("update", make_enemy_ai_system(), { name: "enemy-ai" });
	h.time.advance(1 / 60);
	h.schedule.tick(h.world, h.ctx);
	return {
		w: h.world,
		ctx: h.ctx,
		tick: () => {
			h.time.advance(1 / 60);
			h.schedule.tick(h.world, h.ctx);
		},
	};
};

const spawn_player = (sim: Sim, x: number, y: number, health = 3): Id =>
	sim.w.spawn(
		[player_c, true],
		[pos_c, { x, y }],
		[hitbox_c, { radius: 4 }],
		[health_c, { current: health, max: health }],
	);

const spawn_chaser = (sim: Sim, x: number, y: number): Id =>
	sim.w.spawn(
		[chaser_c, true],
		[pos_c, { x, y }],
		[vel_c, { x: 0, y: 0 }],
		[hitbox_c, { radius: 4 }],
		[health_c, { current: 1, max: 1 }],
	);

const get_health = (sim: Sim, id: Id): number => {
	const r = sim.w.get(id, health_c);
	if (!r.ok) throw new Error("health missing");
	return r.value.current;
};

const get_vel = (sim: Sim, id: Id) => {
	const r = sim.w.get(id, vel_c);
	if (!r.ok) throw new Error("vel missing");
	return r.value;
};

const get_pos = (sim: Sim, id: Id) => {
	const r = sim.w.get(id, pos_c);
	if (!r.ok) throw new Error("pos missing");
	return r.value;
};

const set_chasers_alive = (sim: Sim, n: number): void => {
	const r = sim.ctx.res.get(wave_r);
	if (!r.ok) throw new Error("wave_r missing");
	r.value.chasers_alive = n;
};

describe("enemy AI", () => {
	test("vel set toward player from offset", () => {
		const sim = make_sim();
		spawn_player(sim, 160, 90);
		const chaser_id = spawn_chaser(sim, 200, 90);
		set_chasers_alive(sim, 1);

		sim.tick();

		const v = get_vel(sim, chaser_id);
		expect(v.x).toBeLessThan(0); // chaser at x=200, player at x=160 → move left
		expect(Math.abs(v.y)).toBeLessThan(1e-6);
		expect(Math.hypot(v.x, v.y)).toBeCloseTo(30, 5);
	});

	test("chaser sitting on player resolves without NaN (despawn-on-contact)", () => {
		const sim = make_sim();
		const player_id = spawn_player(sim, 160, 90);
		const chaser_id = spawn_chaser(sim, 160, 90);
		set_chasers_alive(sim, 1);

		sim.tick();

		// Contact-check runs before the divide; chaser is consumed, no NaN possible.
		expect(sim.w.has(chaser_id, chaser_c)).toBe(false);
		expect(get_health(sim, player_id)).toBe(2);
	});

	test("multiple chasers each set vel toward player independently", () => {
		const sim = make_sim();
		spawn_player(sim, 160, 90);
		const c1 = spawn_chaser(sim, 200, 90); // right of player
		const c2 = spawn_chaser(sim, 120, 90); // left of player
		const c3 = spawn_chaser(sim, 160, 130); // below player
		set_chasers_alive(sim, 3);

		sim.tick();

		expect(get_vel(sim, c1).x).toBeLessThan(0);
		expect(get_vel(sim, c2).x).toBeGreaterThan(0);
		expect(get_vel(sim, c3).y).toBeLessThan(0);
	});

	test("contact damage: chaser at overlap distance damages player + despawns", () => {
		const sim = make_sim();
		const player_id = spawn_player(sim, 160, 90, 3);
		const chaser_id = spawn_chaser(sim, 167, 90); // dist=7, contact radius=8
		set_chasers_alive(sim, 1);

		sim.tick();

		expect(get_health(sim, player_id)).toBe(2);
		expect(sim.w.has(chaser_id, chaser_c)).toBe(false);

		const events = sim.ctx.res.get(hit_events_r);
		if (!events.ok) throw new Error("hit_events_r missing");
		expect(events.value.events.length).toBeGreaterThanOrEqual(1);
		const ev = events.value.events.find(e => e.target_id === player_id);
		expect(ev).toBeDefined();
		expect(ev!.damage).toBe(1);

		const wave = sim.ctx.res.get(wave_r);
		if (!wave.ok) throw new Error("wave_r missing");
		expect(wave.value.chasers_alive).toBe(0);
	});

	test("player at 0 HP still ticks safely; remaining chasers function", () => {
		const sim = make_sim();
		const player_id = spawn_player(sim, 160, 90, 0);
		const c1 = spawn_chaser(sim, 167, 90); // contact
		const c2 = spawn_chaser(sim, 200, 90); // far
		set_chasers_alive(sim, 2);

		sim.tick();

		expect(get_health(sim, player_id)).toBe(-1);
		expect(sim.w.has(c1, chaser_c)).toBe(false);
		expect(sim.w.has(c2, chaser_c)).toBe(true);
		const v = get_vel(sim, c2);
		expect(v.x).toBeLessThan(0);
	});

	test("chaser converges over multiple ticks (with movement integration)", async () => {
		// Need movement system too — register it manually here.
		const { make_movement_system } = await import("../src/systems/movement.ts");
		const scenario = make_arena_scenario({ seed: 42 });
		const h = scenario.h;
		h.schedule.add("update", make_enemy_ai_system(), { phase: 0, name: "enemy-ai" });
		h.schedule.add("update", make_movement_system(), { phase: 1, name: "movement" });

		const player_id = h.world.spawn(
			[player_c, true],
			[pos_c, { x: 160, y: 90 }],
			[hitbox_c, { radius: 4 }],
			[health_c, { current: 3, max: 3 }],
		);
		const chaser_id = h.world.spawn(
			[chaser_c, true],
			[pos_c, { x: 220, y: 90 }],
			[vel_c, { x: 0, y: 0 }],
			[hitbox_c, { radius: 4 }],
			[health_c, { current: 1, max: 1 }],
		);
		h.res.get(wave_r);
		const wave = h.res.get(wave_r);
		if (wave.ok) wave.value.chasers_alive = 1;

		const sim = { w: h.world, ctx: h.ctx, tick: () => { h.time.advance(1/60); h.schedule.tick(h.world, h.ctx); } } as Sim;

		// 60 px gap / 30 px/sec = 2 seconds = 120 ticks. After 200 ticks, contact must have happened.
		for (let i = 0; i < 200; i++) {
			if (!sim.w.has(chaser_id, chaser_c)) break;
			sim.tick();
		}

		expect(sim.w.has(chaser_id, chaser_c)).toBe(false);
		expect(get_health(sim, player_id)).toBe(2);
		// player did not move (no input)
		const pp = get_pos(sim, player_id);
		expect(pp.x).toBeCloseTo(160, 1);
		expect(pp.y).toBeCloseTo(90, 1);
	});
});
