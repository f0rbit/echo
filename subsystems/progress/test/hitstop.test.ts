import { describe, expect, test } from "bun:test";
import type { Id, System } from "@f0rbit/forge";
import { hit_events_r, hitstop_r, progress_r } from "../src/resources.ts";
import {
	make_hitstop_release_system,
	make_hitstop_trigger_system,
} from "../src/systems/hitstop.ts";
import { make_progress_scenario } from "./fixtures/progress-scenario.ts";

const fixed_dt = 1 / 60;

// Mirrors arena/test/hitstop.test.ts but with progress's gate
// convention (paused/dead) and HITSTOP_TICKS=3 (vs arena's 4 — see
// hitstop.ts comment).

const make_sim = () => {
	const scenario = make_progress_scenario({ with_player: true });
	const h = scenario.h;
	h.schedule.add("pre", make_hitstop_release_system(), { phase: 4, name: "hitstop_release" });
	h.schedule.add("update", make_hitstop_trigger_system(), { phase: 99, name: "hitstop_trigger" });
	return h;
};

const push_event = (h: ReturnType<typeof make_sim>): void => {
	const r = h.ctx.res.get(hit_events_r);
	if (!r.ok) throw new Error("hit_events_r missing");
	r.value.events.push({ target_id: 0 as Id, x: 0, y: 0, damage: 1 });
};

const clear_events = (h: ReturnType<typeof make_sim>): void => {
	const r = h.ctx.res.get(hit_events_r);
	if (r.ok) r.value.events = [];
};

const remaining = (h: ReturnType<typeof make_sim>): number => {
	const r = h.ctx.res.get(hitstop_r);
	if (!r.ok) throw new Error("hitstop_r missing");
	return r.value.remaining;
};

const tick = (h: ReturnType<typeof make_sim>): void => {
	h.time.advance(fixed_dt);
	h.schedule.tick(h.world, h.ctx);
};

describe("progress hitstop", () => {
	test("trigger sets remaining = 3 on hit event; time.scale never mutated", () => {
		const h = make_sim();
		push_event(h);
		tick(h);
		expect(remaining(h)).toBe(3);
		expect(h.time.scale).toBe(1);
	});

	test("release counts down: 2, 1, 0 across 3 subsequent ticks", () => {
		const h = make_sim();
		push_event(h);
		tick(h);
		expect(remaining(h)).toBe(3);
		clear_events(h);

		tick(h);
		expect(remaining(h)).toBe(2);
		tick(h);
		expect(remaining(h)).toBe(1);
		tick(h);
		expect(remaining(h)).toBe(0);
		expect(h.time.scale).toBe(1);
	});

	test("trigger early-returns while paused; gameplay pause + hitstop don't compose into a double-freeze", () => {
		const h = make_sim();
		h.res.set(progress_r, { paused: true, dirty_stats: false, dead: false });
		push_event(h);
		tick(h);
		expect(remaining(h)).toBe(0);
	});

	test("trigger early-returns while dead; can't hitstop a corpse", () => {
		const h = make_sim();
		h.res.set(progress_r, { paused: false, dirty_stats: false, dead: true });
		push_event(h);
		tick(h);
		expect(remaining(h)).toBe(0);
	});

	test("schedule continues to tick during hitstop (no time.scale deadlock)", () => {
		const h = make_sim();
		let ran = 0;
		const periodic: System = () => { ran += 1; };
		h.schedule.add("update", periodic, { phase: 50, name: "periodic" });

		push_event(h);
		tick(h);
		clear_events(h);
		const after_trigger = ran;
		for (let i = 0; i < 3; i++) tick(h);
		expect(ran).toBeGreaterThan(after_trigger);
		expect(remaining(h)).toBe(0);
	});
});
