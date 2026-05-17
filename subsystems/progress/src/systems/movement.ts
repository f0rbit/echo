// movement.ts — cell-step (per .plans/progress.md §2 Q1). Mirrors loot's
// movement.ts; adds the `progress_r.paused` early-return per §2 Q4 and
// reads wall_index_r + creature_occupancy_r so the player can't walk
// onto a chaser. v1 walls are empty per resources.ts; chaser occupancy
// is rebuilt every tick by creature_occupancy_system.
//
// The player's own cell is in occupancy — we mask it via `cur_key` so
// the player isn't blocked by themselves. Mirrors bestiary path-step's
// pattern.
import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { ticks_per_step } from "@f0rbit/forge/grid";
import type { Cell } from "@f0rbit/forge/grid";
import { dir_c, player_c } from "../components.ts";
import { g } from "../grid.ts";
import { creature_occupancy_r, progress_r, wall_index_r } from "../resources.ts";

export const step_every = ticks_per_step(6, 1 / 60);

export const movement_system: System = (w, ctx) => {
	const prog = ctx.res.get(progress_r);
	if (prog.ok && prog.value.paused) return;

	const wi = ctx.res.get(wall_index_r);
	const walls = wi.ok ? wi.value.cells : new Set<number>();
	const occ = ctx.res.get(creature_occupancy_r);
	const occupancy = occ.ok ? occ.value.cells : new Set<number>();

	for (const [id, d, p] of w.query([dir_c, player_c, pos_c] as const).collect()) {
		const cur = g.world_to_cell(p.x, p.y);
		const cur_key = g.key(cur.x, cur.y);
		const blocked_by = (c: Cell): boolean => {
			const k = g.key(c.x, c.y);
			if (walls.has(k)) return true;
			if (k === cur_key) return false;
			if (occupancy.has(k)) return true;
			return false;
		};
		g.move_tile(w, id, d, { blocked_by });
	}
};
