import type { System } from "@f0rbit/forge";
import { setup_arena } from "../arena-gen.ts";
import { run_seed_r } from "../resources.ts";

// restart.ts — R wipes the world and re-runs arena-gen.
//
// Increments run_seed_r.restart_count BEFORE setup_arena so the next
// pickup-scatter RNG fork differs from the previous run. Mirrors arena's
// restart pattern (see subsystems/arena/src/systems/restart.ts).

export const make_restart_system = (): System => (w, ctx) => {
	if (!ctx.input.just("restart")) return;
	const prev = ctx.res.get(run_seed_r);
	const base = prev.ok ? prev.value.base : ctx.rng.seed;
	const restart_count = (prev.ok ? prev.value.restart_count : 0) + 1;
	w.clear();
	ctx.res.set(run_seed_r, { base, restart_count });
	setup_arena(w, ctx);
};
