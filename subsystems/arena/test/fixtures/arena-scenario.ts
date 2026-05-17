import { harness, type Harness } from "@f0rbit/forge";
import { game_bindings } from "../../src/bindings.ts";
import { arena_r, hit_events_r, hitstop_r, particles_r, run_seed_r, wave_r } from "../../src/resources.ts";
import { g } from "../../src/grid.ts";

export type ArenaScenarioOpts = {
	seed?: number;
	with_dummy?: boolean;
	with_chasers?: number;
};

export type ArenaScenario = {
	h: Harness;
	tick: (real_dt?: number) => void;
};

const fixed_dt = 1 / 60;
const particle_capacity = 256;

export const make_arena_scenario = (opts: ArenaScenarioOpts = {}): ArenaScenario => {
	const seed = opts.seed ?? 1;
	const h = harness({ seed, fixed_dt, bindings: game_bindings });
	h.res.set(arena_r, {
		cols: g.cols,
		rows: g.rows,
		width: g.cols * g.tile,
		height: g.rows * g.tile,
	});
	h.res.set(run_seed_r, { base: seed, restart_count: 0 });
	h.res.set(wave_r, { current: 0, total: 3, chasers_alive: 0, total_kills: 0 });
	h.res.set(hitstop_r, { remaining: 0 });
	h.res.set(hit_events_r, { events: [] });
	h.res.set(particles_r, { entries: [], head: 0, capacity: particle_capacity });
	// Phase 3.1 stub: with_dummy / with_chasers consumed by later phases once
	// spawn helpers exist (arena-gen.ts / waves.ts in Phase 3.2+).
	void opts.with_dummy;
	void opts.with_chasers;
	return { h, tick: h.tick };
};
