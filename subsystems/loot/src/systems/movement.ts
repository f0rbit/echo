import type { System } from "@f0rbit/forge";
import type { Cell } from "@f0rbit/forge/grid";
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
// Walls: the perimeter cell ring is rendered as walls (see arena-gen.ts —
// Phase 5.9.2 reserved these cells from pickup placement). We mirror that
// here as a blocked_by predicate so the player can't walk onto a wall.
// Loot has no other collision (no chasers, no path-step), so this is the
// only consumer of the predicate — keeping it inline avoids growing
// wall_index_r infrastructure that loot doesn't otherwise need.

export const step_every = ticks_per_step(6, 1 / 60);

const is_perimeter = (c: Cell): boolean =>
	c.x === 0 || c.x === g.cols - 1 || c.y === 0 || c.y === g.rows - 1;

export const movement_system: System = (w) => {
	for (const [id, d] of w.query([dir_c, player_c] as const).collect()) {
		g.move_tile(w, id, d, { blocked_by: is_perimeter });
	}
};
