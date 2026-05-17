import { describe, expect, test } from "bun:test";
import { pos_c, type Ctx, type Id, type World } from "@f0rbit/forge";
import { chaser_c, player_c, vel_c, health_c, hitbox_c } from "../src/components.ts";
import { arena_r, run_seed_r, wave_r } from "../src/resources.ts";
import { make_arena_scenario } from "./fixtures/arena-scenario.ts";
import { make_waves_system } from "../src/systems/waves.ts";
import { make_restart_system } from "../src/systems/restart.ts";
import { spawn_wave, setup_arena } from "../src/arena-gen.ts";
import { g } from "../src/grid.ts";

const DESIGN_WIDTH = 320;
const DESIGN_HEIGHT = 180;

type Sim = { w: World; ctx: Ctx; tick: () => void };

const make_sim = (): Sim => {
	const scenario = make_arena_scenario({ seed: 42 });
	const h = scenario.h;
	// arena_r is set by the scenario fixture using grid dims; reset to design.
	h.res.set(arena_r, {
		cols: g.cols,
		rows: g.rows,
		width: DESIGN_WIDTH,
		height: DESIGN_HEIGHT,
	});
	h.res.set(run_seed_r, { base: 42, restart_count: 0 });
	// Initialize at the win state (current=total, chasers_alive=0) so the fixture's
	// initial schedule.tick is a no-op. Tests overwrite wave_r as needed before
	// their own ticks.
	h.res.set(wave_r, { current: 3, total: 3, chasers_alive: 0 });
	h.schedule.add("update", make_waves_system(), { phase: 0, name: "waves" });
	return {
		w: h.world,
		ctx: h.ctx,
		tick: () => {
			h.time.advance(1 / 60);
			h.schedule.tick(h.world, h.ctx);
		},
	};
};

const get_wave = (sim: Sim) => {
	const r = sim.ctx.res.get(wave_r);
	if (!r.ok) throw new Error("wave_r missing");
	return r.value;
};

const spawn_chaser_with_health = (sim: Sim, x: number, y: number, hp: number): Id =>
	sim.w.spawn(
		[chaser_c, true],
		[pos_c, { x, y }],
		[vel_c, { x: 0, y: 0 }],
		[hitbox_c, { radius: 4 }],
		[health_c, { current: hp, max: 1 }],
	);

const count_chasers = (sim: Sim): number =>
	sim.w.query([chaser_c] as const).collect().length;

describe("wave manager", () => {
	test("reap dead chasers: health<=0 → despawn + decrement alive", () => {
		const sim = make_sim();
		const c1 = spawn_chaser_with_health(sim, 100, 90, 0);
		const c2 = spawn_chaser_with_health(sim, 200, 90, 1);
		get_wave(sim).chasers_alive = 2;

		sim.tick();

		expect(sim.w.has(c1, chaser_c)).toBe(false);
		expect(sim.w.has(c2, chaser_c)).toBe(true);
		expect(get_wave(sim).chasers_alive).toBe(1);
	});

	test("wave-clear: kill all wave-1 chasers → wave becomes 2 + spawn 5 new", () => {
		const sim = make_sim();
		// 3 dead chasers; chasers_alive=3 from earlier "spawn".
		for (let i = 0; i < 3; i++) spawn_chaser_with_health(sim, 50 + i * 30, 90, 0);
		get_wave(sim).chasers_alive = 3;
		get_wave(sim).current = 1;

		sim.tick();

		expect(get_wave(sim).current).toBe(2);
		expect(get_wave(sim).chasers_alive).toBe(5);
		expect(count_chasers(sim)).toBe(5);
	});

	test("win condition: kill all wave-3 chasers → no further spawn", () => {
		const sim = make_sim();
		spawn_chaser_with_health(sim, 100, 90, 0);
		get_wave(sim).chasers_alive = 1;
		get_wave(sim).current = 3;

		sim.tick();

		expect(get_wave(sim).current).toBe(3);
		expect(get_wave(sim).chasers_alive).toBe(0);
		expect(count_chasers(sim)).toBe(0);

		sim.tick(); // additional tick — still no spawn
		expect(get_wave(sim).current).toBe(3);
		expect(count_chasers(sim)).toBe(0);
	});

	test("spawn_wave places chasers around the perimeter (4-12px inset)", () => {
		const sim = make_sim();
		spawn_wave(sim.w, sim.ctx, 50);

		const chasers = sim.w.query([chaser_c, pos_c] as const).collect();
		expect(chasers.length).toBe(50);

		for (const [, p] of chasers) {
			const on_top = p.y >= 4 && p.y <= 12;
			const on_bottom = p.y >= DESIGN_HEIGHT - 12 && p.y <= DESIGN_HEIGHT - 4;
			const on_left = p.x >= 4 && p.x <= 12;
			const on_right = p.x >= DESIGN_WIDTH - 12 && p.x <= DESIGN_WIDTH - 4;
			expect(on_top || on_bottom || on_left || on_right).toBe(true);
		}
	});

	test("restart: R key resets wave_r + spawns wave 1 + increments restart_count", () => {
		const scenario = make_arena_scenario({ seed: 42 });
		const h = scenario.h;
		// Reset arena_r to design size so setup_arena perimeter math is consistent.
		h.res.set(arena_r, { cols: g.cols, rows: g.rows, width: DESIGN_WIDTH, height: DESIGN_HEIGHT });
		h.res.set(run_seed_r, { base: 42, restart_count: 0 });
		h.res.set(wave_r, { current: 1, total: 3, chasers_alive: 0 });

		// Initial setup_arena to give us a populated world.
		setup_arena(h.world, h.ctx);
		const initial_chasers = h.world.query([chaser_c] as const).collect().length;
		expect(initial_chasers).toBe(5);

		// Mid-game corruption: kill all chasers, advance wave to 2.
		for (const [id] of h.world.query([chaser_c] as const).collect()) h.world.despawn(id);
		const w0 = h.res.get(wave_r);
		if (!w0.ok) throw new Error("wave_r missing");
		w0.value.current = 2;
		w0.value.chasers_alive = 0;

		// Trigger restart via the input override channel.
		h.schedule.add("pre", make_restart_system(), { name: "restart" });
		h.input.inject_actions([{ kind: "press", action: "restart" }]);
		h.time.advance(1 / 60);
		h.schedule.tick(h.world, h.ctx);

		const w1 = h.res.get(wave_r);
		if (!w1.ok) throw new Error("wave_r missing");
		expect(w1.value.current).toBe(1);
		expect(w1.value.chasers_alive).toBe(5);
		expect(h.world.query([chaser_c] as const).collect().length).toBe(5);
		// player should be respawned too
		expect(h.world.query([player_c] as const).collect().length).toBe(1);

		const seed = h.res.get(run_seed_r);
		if (!seed.ok) throw new Error("run_seed_r missing");
		expect(seed.value.restart_count).toBe(1);
		expect(seed.value.base).toBe(42);
	});
});
