import { describe, expect, test } from "bun:test";
import { pos_c, type Ctx, type System, type World } from "@f0rbit/forge";
import { chaser_c, health_c, hitbox_c, player_c, vel_c } from "../src/components.ts";
import { hit_events_r, hitstop_r, wave_r } from "../src/resources.ts";
import { make_enemy_ai_system } from "../src/systems/enemy-ai.ts";
import { make_hitstop_release_system, make_hitstop_trigger_system } from "../src/systems/hitstop.ts";
import { make_movement_system } from "../src/systems/movement.ts";
import { make_arena_scenario } from "./fixtures/arena-scenario.ts";

const fixed_dt = 1 / 60;

type Sim = {
	tick_real: (n: number) => number;
	scale: () => number;
	remaining: () => number;
	push_event: () => void;
	clear_events: () => void;
	periodic_runs: () => number;
	w: World;
	ctx: Ctx;
};

const make_sim = (): Sim => {
	const scenario = make_arena_scenario({ seed: 1 });
	const h = scenario.h;
	h.schedule.add("pre", make_hitstop_release_system(), { name: "hitstop_release" });
	h.schedule.add("update", make_hitstop_trigger_system(), { phase: 99, name: "hitstop_trigger" });

	let periodic = 0;
	const periodic_system: System = () => {
		periodic += 1;
	};
	h.schedule.add("update", periodic_system, { every: 1, name: "periodic" });

	return {
		tick_real: (n) => h.time.advance(n * fixed_dt, () => h.schedule.tick(h.world, h.ctx)),
		scale: () => h.time.scale,
		remaining: () => {
			const r = h.ctx.res.get(hitstop_r);
			if (!r.ok) throw new Error("hitstop_r missing");
			return r.value.remaining;
		},
		push_event: () => {
			const r = h.ctx.res.get(hit_events_r);
			if (!r.ok) throw new Error("hit_events_r missing");
			r.value.events.push({ target_id: 0 as never, x: 0, y: 0, damage: 1 });
		},
		periodic_runs: () => periodic,
		clear_events: () => {
			const r = h.ctx.res.get(hit_events_r);
			if (r.ok) r.value.events = [];
		},
		w: h.world,
		ctx: h.ctx,
	};
};

describe("hitstop", () => {
	test("trigger sets remaining = 4 on hit event; time.scale never mutated", () => {
		const sim = make_sim();
		sim.push_event();
		sim.tick_real(1);
		expect(sim.remaining()).toBe(4);
		expect(sim.scale()).toBe(1);
	});

	test("release counts down remaining: 3, 2, 1, 0 across 4 subsequent ticks", () => {
		const sim = make_sim();
		sim.push_event();
		sim.tick_real(1);
		expect(sim.remaining()).toBe(4);
		// Mirror production: hit_events cleared each pre stage (by plugin's clear
		// system, registered before hitstop_release). Test omits clear from the
		// schedule for setup simplicity; do it manually after trigger consumes.
		sim.clear_events();

		sim.tick_real(1);
		expect(sim.remaining()).toBe(3);

		sim.tick_real(1);
		expect(sim.remaining()).toBe(2);

		sim.tick_real(1);
		expect(sim.remaining()).toBe(1);

		sim.tick_real(1);
		expect(sim.remaining()).toBe(0);

		expect(sim.scale()).toBe(1);
	});

	test("schedule continues to tick during hitstop (no time.scale deadlock)", () => {
		const sim = make_sim();
		const before = sim.periodic_runs();
		sim.push_event();
		const consumed_first = sim.tick_real(1);
		expect(consumed_first).toBe(1);
		expect(sim.periodic_runs()).toBe(before + 1);
		sim.clear_events();

		// Even while remaining > 0, schedule ticks keep firing.
		const periodic_after_trigger = sim.periodic_runs();
		const consumed = sim.tick_real(4);
		expect(consumed).toBe(4);
		expect(sim.periodic_runs()).toBe(periodic_after_trigger + 4);
	});

	test("gameplay state does NOT advance while remaining > 0; resumes after", () => {
		const scenario = make_arena_scenario({ seed: 1 });
		const h = scenario.h;
		h.schedule.add("pre", make_hitstop_release_system(), { name: "hitstop_release" });
		h.schedule.add("update", make_enemy_ai_system(), { phase: 0, name: "enemy_ai" });
		h.schedule.add("update", make_movement_system(), { phase: 1, name: "movement" });
		h.schedule.add("update", make_hitstop_trigger_system(), { phase: 99, name: "hitstop_trigger" });

		// Player to the right so the chaser at (50, 90) gets a positive x velocity.
		h.world.spawn(
			[player_c, true],
			[pos_c, { x: 200, y: 90 }],
			[hitbox_c, { radius: 4 }],
			[health_c, { current: 3, max: 3 }],
		);
		const chaser_id = h.world.spawn(
			[chaser_c, true],
			[pos_c, { x: 50, y: 90 }],
			[vel_c, { x: 0, y: 0 }],
			[hitbox_c, { radius: 4 }],
			[health_c, { current: 1, max: 1 }],
		);
		const wave = h.ctx.res.get(wave_r);
		if (wave.ok) wave.value.chasers_alive = 1;

		const get_chaser_x = (): number => {
			const r = h.world.get(chaser_id, pos_c);
			if (!r.ok) throw new Error("chaser pos missing");
			return r.value.x;
		};

		// Warm-up tick: AI sets vel toward player, movement integrates → chaser moves right.
		h.time.advance(fixed_dt, () => h.schedule.tick(h.world, h.ctx));
		const x_after_warmup = get_chaser_x();
		expect(x_after_warmup).toBeGreaterThan(50);

		// Trigger hitstop: push event, tick once → remaining = 4.
		const ev = h.ctx.res.get(hit_events_r);
		if (!ev.ok) throw new Error("hit_events_r missing");
		ev.value.events.push({ target_id: chaser_id, x: 0, y: 0, damage: 1 });
		h.time.advance(fixed_dt, () => h.schedule.tick(h.world, h.ctx));

		const hs = h.ctx.res.get(hitstop_r);
		if (!hs.ok) throw new Error("hitstop_r missing");
		expect(hs.value.remaining).toBe(4);
		const x_at_trigger = get_chaser_x();
		// Clear events to mirror production's pre-stage clear (omitted from this
		// minimal schedule); otherwise the trigger re-fires when remaining hits 0.
		ev.value.events = [];

		// Release runs in pre stage BEFORE update. So remaining counts down
		// 4→3→2→1→0 across the next 4 ticks; the gate (`remaining > 0`) is
		// checked AFTER decrement, so gameplay is frozen on the 3 ticks where
		// remaining ends up > 0 post-decrement, and resumes on tick 4 (the one
		// where pre brings remaining to 0).
		h.time.advance(fixed_dt, () => h.schedule.tick(h.world, h.ctx));
		expect(hs.value.remaining).toBe(3);
		expect(get_chaser_x()).toBe(x_at_trigger);

		h.time.advance(fixed_dt, () => h.schedule.tick(h.world, h.ctx));
		expect(hs.value.remaining).toBe(2);
		expect(get_chaser_x()).toBe(x_at_trigger);

		h.time.advance(fixed_dt, () => h.schedule.tick(h.world, h.ctx));
		expect(hs.value.remaining).toBe(1);
		expect(get_chaser_x()).toBe(x_at_trigger);

		// 4th post-trigger tick: pre decrements 1→0, update runs gameplay → chaser moves.
		h.time.advance(fixed_dt, () => h.schedule.tick(h.world, h.ctx));
		expect(hs.value.remaining).toBe(0);
		expect(get_chaser_x()).toBeGreaterThan(x_at_trigger);

		// Next tick after that: gameplay still running, chaser continues to move.
		const x_after_resume = get_chaser_x();
		h.time.advance(fixed_dt, () => h.schedule.tick(h.world, h.ctx));
		expect(get_chaser_x()).toBeGreaterThan(x_after_resume);

		// time.scale never mutated.
		expect(h.time.scale).toBe(1);
	});
});
