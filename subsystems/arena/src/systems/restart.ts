import type { System } from "@f0rbit/forge";
import { setup_arena } from "../arena-gen.ts";
import { run_seed_r } from "../resources.ts";

/**
 * Restart — R key wipes the world and re-runs setup_arena.
 *
 * Increments run_seed_r.restart_count BEFORE setup_arena so the new wave RNG
 * fork differs from the previous run. setup_arena reads run_seed_r to preserve
 * the bumped count when it resets the rest of the resources.
 *
 * Game-over (player health <= 0) does not auto-restart — the player presses R.
 */

export const make_restart_system = (): System => (w, ctx) => {
	if (!ctx.input.just("restart")) return;

	const prev = ctx.res.get(run_seed_r);
	const base = prev.ok ? prev.value.base : ctx.rng.seed;
	const restart_count = (prev.ok ? prev.value.restart_count : 0) + 1;

	w.clear();
	ctx.res.set(run_seed_r, { base, restart_count });
	setup_arena(w, ctx);
};
