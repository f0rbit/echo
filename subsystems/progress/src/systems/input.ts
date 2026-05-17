// input.ts — reads movement axes. The `restart` (R) action is handled by
// restart.ts directly; `swing` (Z) by melee-swing.ts; `pick_perk_0..2`
// (1/2/3) by systems/synthetic-perk-pick.ts (mirrors loot's
// synthetic-slot-click.ts replay-bridge pattern — per AGENTS.md "Synthetic
// action bindings for replay-recordable UI clicks").
//
// Cell-step convention (per .plans/progress.md §2 Q1): set dir_c on the
// player every tick. movement.ts only fires every `step_every` ticks, so
// dir_c persists between movement attempts and the player keeps walking
// in the same direction until input changes.
import type { System } from "@f0rbit/forge";
import { dir_c, player_c } from "../components.ts";
import { progress_r } from "../resources.ts";
import type { PerksSystem } from "./perks.ts";

const sign = (n: number): -1 | 0 | 1 => (n > 0.3 ? 1 : n < -0.3 ? -1 : 0);

// PerksSystem is still threaded through the constructor (Phase 5.3 API
// contract) but no longer read here — synthetic-perk-pick is the sole
// keyboard/replay bridge. Kept to avoid a plugin.ts signature churn.
export const make_input_system = (_perks_sys: PerksSystem): System => (w, ctx) => {
	const prog = ctx.res.get(progress_r);
	const paused = prog.ok && prog.value.paused;
	if (paused) return;

	const [ax, ay] = ctx.input.vector("move.x", "move.y");
	const dx = sign(ax);
	const dy = sign(ay);
	for (const [id] of w.query([player_c, dir_c] as const)) {
		// Only update dir_c when there's nonzero input — facing persistence
		// (cell-step convention; bestiary's pattern). melee-swing reads dir_c
		// to find the target cell, so a stationary player still has a heading.
		if (dx === 0 && dy === 0) continue;
		w.set(id, dir_c, { dx, dy });
	}
};
