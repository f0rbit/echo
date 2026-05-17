import { describe, expect, test } from "bun:test";
import type { Ctx, System, World } from "@f0rbit/forge";
import { hit_events_r, hitstop_r } from "../src/resources.ts";
import { make_hitstop_release_system, make_hitstop_trigger_system } from "../src/systems/hitstop.ts";
import { make_arena_scenario } from "./fixtures/arena-scenario.ts";

const fixed_dt = 1 / 60;

type Sim = {
	tick_real: (n: number) => number;
	run_release: () => void;
	scale: () => number;
	remaining: () => number;
	push_event: () => void;
	periodic_runs: () => number;
	w: World;
	ctx: Ctx;
};

const make_sim = (): Sim => {
	const scenario = make_arena_scenario({ seed: 1 });
	const h = scenario.h;
	const release = make_hitstop_release_system();
	h.schedule.add("pre", release, { name: "hitstop_release" });
	h.schedule.add("update", make_hitstop_trigger_system(), { phase: 99, name: "hitstop_trigger" });

	let periodic = 0;
	const periodic_system: System = () => {
		periodic += 1;
	};
	h.schedule.add("update", periodic_system, { every: 1, name: "periodic" });

	return {
		tick_real: (n) => h.time.advance(n * fixed_dt, () => h.schedule.tick(h.world, h.ctx)),
		run_release: () => release(h.world, h.ctx),
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
		w: h.world,
		ctx: h.ctx,
	};
};

describe("hitstop", () => {
	test("trigger sets time.scale = 0 and remaining = 4 on hit event", () => {
		const sim = make_sim();
		sim.push_event();
		sim.tick_real(1);
		expect(sim.scale()).toBe(0);
		expect(sim.remaining()).toBe(4);
	});

	test("periodic systems pause while frozen", () => {
		const sim = make_sim();
		sim.tick_real(1);
		const before = sim.periodic_runs();
		sim.push_event();
		sim.tick_real(1);
		const at_trigger = sim.periodic_runs();
		expect(at_trigger).toBe(before + 1);

		const consumed = sim.tick_real(10);
		expect(consumed).toBe(0);
		expect(sim.periodic_runs()).toBe(at_trigger);
	});

	test("release decrements remaining and restores scale to 1 after 4 calls", () => {
		const sim = make_sim();
		sim.push_event();
		sim.tick_real(1);
		expect(sim.scale()).toBe(0);
		expect(sim.remaining()).toBe(4);

		sim.run_release();
		expect(sim.remaining()).toBe(3);
		expect(sim.scale()).toBe(0);

		sim.run_release();
		expect(sim.remaining()).toBe(2);

		sim.run_release();
		expect(sim.remaining()).toBe(1);
		expect(sim.scale()).toBe(0);

		sim.run_release();
		expect(sim.remaining()).toBe(0);
		expect(sim.scale()).toBe(1);
	});

});
