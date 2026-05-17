// input.ts — reads movement axes + Z swing + 1/2/3 pick_perk + R restart.
//
// Cell-step convention (per .plans/progress.md §2 Q1): set dir_c on the
// player every tick. movement.ts only fires every `step_every` ticks, so
// dir_c persists between movement attempts and the player keeps walking
// in the same direction until input changes.
//
// `restart` (R) is handled by restart.ts directly. `swing` (Z) is handled
// by melee-swing.ts. `pick_perk_0..2` is bridged to perks_sys.queue_perk_pick
// here — per .plans/progress.md §2 Q4 the perk-pick path MUST work even
// when paused; only the movement read gates on paused.
import type { System } from "@f0rbit/forge";
import { dir_c, player_c } from "../components.ts";
import { progress_r } from "../resources.ts";
import type { PerksSystem } from "./perks.ts";

const sign = (n: number): -1 | 0 | 1 => (n > 0.3 ? 1 : n < -0.3 ? -1 : 0);

const PICK_PERK_ACTIONS = ["pick_perk_0", "pick_perk_1", "pick_perk_2"] as const;

export const make_input_system = (perks_sys: PerksSystem): System => (w, ctx) => {
	// Perk-pick always runs — even while paused. It's the only release path.
	for (let i = 0; i < PICK_PERK_ACTIONS.length; i++) {
		if (ctx.input.just(PICK_PERK_ACTIONS[i]!)) perks_sys.queue_perk_pick(i);
	}

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
