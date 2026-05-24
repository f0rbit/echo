// movement.ts — cell-step (per .plans/progress.md §2 Q1). Mirrors loot's
// movement.ts; adds the `progress_r.paused` early-return per §2 Q4 and
// reads wall_index_r + creature_occupancy_r so the player can't walk
// onto a chaser. v1 walls are empty per resources.ts; chaser occupancy
// is rebuilt every tick by creature_occupancy_system.
//
// LIVE-INPUT MOVE VECTOR (not dir_c). echo AGENTS.md "`dir_c` write
// convention diverges by ability shape" — progress is melee-bearing so
// dir_c persists between inputs (last-heading) for the Z swing target.
// If movement read dir_c, releasing all WASD/arrow keys would leave the
// last heading written — and the player would keep cell-stepping in
// that direction every `step_every` ticks. Read the LIVE input vector
// here instead; (0, 0) → no step. dir_c is unchanged (input.ts owns
// its persistence) so the swing still has a heading for the most-recent
// direction the player faced.
import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { ticks_per_step } from "@f0rbit/forge/grid";
import type { Cell } from "@f0rbit/forge/grid";
import { player_c } from "../components.ts";
import { g } from "../grid.ts";
import { creature_occupancy_r, hitstop_r, progress_r, wall_index_r } from "../resources.ts";

export const step_every = ticks_per_step(6, 1 / 60);

const sign = (n: number): -1 | 0 | 1 => (n > 0.3 ? 1 : n < -0.3 ? -1 : 0);

export const movement_system: System = (w, ctx) => {
	const prog = ctx.res.get(progress_r);
	if (prog.ok && (prog.value.paused || prog.value.dead)) return;
	const hs = ctx.res.get(hitstop_r);
	if (hs.ok && hs.value.remaining > 0) return;

	const [ax, ay] = ctx.input.vector("move.x", "move.y");
	const dx = sign(ax);
	const dy = sign(ay);
	if (dx === 0 && dy === 0) return;

	const wi = ctx.res.get(wall_index_r);
	const walls = wi.ok ? wi.value.cells : new Set<number>();
	const occ = ctx.res.get(creature_occupancy_r);
	const occupancy = occ.ok ? occ.value.cells : new Set<number>();

	for (const [id, p] of w.query([player_c, pos_c] as const).collect()) {
		const cur = g.world_to_cell(p.x, p.y);
		const cur_key = g.key(cur.x, cur.y);
		const blocked_by = (c: Cell): boolean => {
			const k = g.key(c.x, c.y);
			if (walls.has(k)) return true;
			if (k === cur_key) return false;
			if (occupancy.has(k)) return true;
			return false;
		};
		g.move_tile(w, id, { dx, dy }, { blocked_by });
	}
};
