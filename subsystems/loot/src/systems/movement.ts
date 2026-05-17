import type { System } from "@f0rbit/forge";
import { ticks_per_step } from "@f0rbit/forge/grid";
import { dir_c, player_c } from "../components.ts";
import { g } from "../grid.ts";

// movement.ts — cell-step (per .plans/loot.md §2 Q1). Mirrors bestiary.
//
// `g.move_tile` reads pos_c, computes the next cell, and writes pos_c back
// in world coords (cell-centered floats). Boundary is the grid extent —
// `move_tile` calls `in_bounds` internally so no extra clamp is needed
// (per .plans/loot.md §2 Q7).
//
// No walls in loot → blocked_by always returns false.

export const step_every = ticks_per_step(6, 1 / 60);

const no_walls = (): boolean => false;

export const movement_system: System = (w) => {
	for (const [id, d] of w.query([dir_c, player_c] as const).collect()) {
		g.move_tile(w, id, d, { blocked_by: no_walls });
	}
};
