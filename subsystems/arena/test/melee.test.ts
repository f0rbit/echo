import { describe, expect, test } from "bun:test";
import { pos_c, type Ctx, type Id, type World } from "@f0rbit/forge";
import {
	chaser_c,
	dummy_c,
	swing_c,
	lifetime_c,
	hitbox_c,
	health_c,
} from "../src/components.ts";
import { hit_events_r, type HitEvent } from "../src/resources.ts";
import { make_arena_scenario } from "./fixtures/arena-scenario.ts";
import { make_combat_melee_system } from "../src/systems/combat-melee.ts";

type Sim = { w: World; ctx: Ctx; tick: () => void };

const make_sim = (): Sim => {
	const scenario = make_arena_scenario({ seed: 42 });
	const h = scenario.h;
	h.schedule.add("update", make_combat_melee_system(), { name: "combat-melee" });
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

const spawn_swing = (
	sim: Sim,
	origin_x: number,
	origin_y: number,
	dir_x: number,
	dir_y: number,
	radius: number,
	arc_radians: number,
): Id => {
	const len = Math.sqrt(dir_x * dir_x + dir_y * dir_y);
	const id = sim.w.spawn(
		[pos_c, { x: origin_x, y: origin_y }],
		[swing_c, {
			owner_id: 0 as Id,
			dir: { x: dir_x / len, y: dir_y / len },
			arc_radians,
			radius,
		}],
		[lifetime_c, { ticks_remaining: 1 }],
	);
	return id;
};

const spawn_target = (sim: Sim, x: number, y: number, is_chaser: boolean, health = 10): Id => {
	return sim.w.spawn(
		[pos_c, { x, y }],
		[hitbox_c, { radius: 4 }],
		[health_c, { current: health, max: health }],
		is_chaser ? [chaser_c, true] : [dummy_c, true],
	);
};

const get_events = (sim: Sim): HitEvent[] => {
	const r = sim.ctx.res.get(hit_events_r);
	if (!r.ok) throw new Error("hit_events_r missing");
	return r.value.events;
};

const reset_events = (sim: Sim): void => {
	const r = sim.ctx.res.get(hit_events_r);
	if (!r.ok) throw new Error("hit_events_r missing");
	r.value.events = [];
};

const get_health = (sim: Sim, id: Id): number => {
	const r = sim.w.get(id, health_c);
	if (!r.ok) throw new Error("health missing");
	return r.value.current;
};

describe("melee combat", () => {
	test("hit in arc and in range", () => {
		const sim = make_sim();
		const target_id = spawn_target(sim, 170, 90, true, 5);
		spawn_swing(sim, 160, 90, 1, 0, 12, Math.PI / 2);
		reset_events(sim);

		sim.tick();

		const events = get_events(sim);
		expect(events.length).toBe(1);
		expect(events[0]!.target_id).toBe(target_id);
		expect(events[0]!.damage).toBe(1);
		expect(get_health(sim, target_id)).toBe(4);
	});

	test("out of range", () => {
		const sim = make_sim();
		const target_id = spawn_target(sim, 180, 90, true);
		spawn_swing(sim, 160, 90, 1, 0, 12, Math.PI / 2);
		reset_events(sim);

		sim.tick();

		expect(get_events(sim).length).toBe(0);
		expect(get_health(sim, target_id)).toBe(10);
	});

	test("outside arc angle", () => {
		const sim = make_sim();
		const target_id = spawn_target(sim, 160, 100, true);
		spawn_swing(sim, 160, 90, 1, 0, 12, Math.PI / 2);
		reset_events(sim);

		sim.tick();

		expect(get_events(sim).length).toBe(0);
		expect(get_health(sim, target_id)).toBe(10);
	});

	test("edge of arc (boundary inclusive)", () => {
		const sim = make_sim();
		// 45° from swing direction = half of 90° arc
		const angle = Math.PI / 4;
		const x = 160 + 12 * Math.cos(angle);
		const y = 90 + 12 * Math.sin(angle);
		const target_id = spawn_target(sim, x, y, true);
		spawn_swing(sim, 160, 90, 1, 0, 12, Math.PI / 2);
		reset_events(sim);

		sim.tick();

		expect(get_events(sim).length).toBe(1);
		expect(get_health(sim, target_id)).toBe(9);
	});

	test("multiple targets in arc", () => {
		const sim = make_sim();
		const target_1_id = spawn_target(sim, 170, 85, true, 10);
		const target_2_id = spawn_target(sim, 170, 95, true, 10);
		spawn_swing(sim, 160, 90, 1, 0, 12, Math.PI / 2);
		reset_events(sim);

		sim.tick();

		expect(get_events(sim).length).toBe(2);
		expect(get_health(sim, target_1_id)).toBe(9);
		expect(get_health(sim, target_2_id)).toBe(9);
	});
});
