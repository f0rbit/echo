// restart.ts — R wipes the world and re-runs arena-gen. Mirrors loot's
// restart.ts; resets progress_r + level_up_pending_r so a restart from a
// mid-level-up pause comes back clean.
//
// Disk-save clear is Phase 5.5 work; this system does not touch
// localStorage today.
//
// NOT gated on `progress_r.paused`: restart is the user's escape hatch
// from any stuck state, including a stuck pause.
import type { System } from "@f0rbit/forge";
import { setup_arena } from "../arena-gen.ts";
import { level_up_pending_r, progress_r, run_seed_r } from "../resources.ts";

export const make_restart_system = (): System => (w, ctx) => {
	if (!ctx.input.just("restart")) return;
	const prev = ctx.res.get(run_seed_r);
	const base = prev.ok ? prev.value.base : ctx.rng.seed;
	const restart_count = (prev.ok ? prev.value.restart_count : 0) + 1;
	w.clear();
	ctx.res.set(run_seed_r, { base, restart_count });
	ctx.res.set(progress_r, { paused: false, dirty_stats: false });
	ctx.res.set(level_up_pending_r, { pending: false, choices: [] });
	setup_arena(w, ctx);
};
