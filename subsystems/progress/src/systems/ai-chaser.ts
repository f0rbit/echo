// FORGE-PROMOTION-CANDIDATE: copied from
// subsystems/bestiary/src/systems/ai/chaser.ts. progress is the 2nd
// consumer (boss Phase 6 will be the 3rd). Phase 8 (`main`) should
// extract to @f0rbit/forge per AGENTS.md §5 promotion criteria.
//
// Adaptations from the bestiary original:
//   1. Added `progress_r.paused` early-return per .plans/progress.md
//      §2 Q4 — every gameplay system early-returns while the level-up
//      perk-pick is pending.
//   2. progress's `state_c` carries `{ kind }` only — aggro_radius
//      lives as a module constant (AGGRO_RADIUS) instead of being
//      part of the state shape. Components.ts intentionally left
//      unchanged (per phase 5.3 plan).
//   3. progress's `Path` uses `idx` (not `index`).
//   4. queries `chaser_c` directly — there is no umbrella `enemy_c`
//      in progress.
//
// If you edit this file, sync the change back to bestiary's copy
// (and forward to any other copy that exists). Annotated 2026-05-18.
import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import type { Cell } from "@f0rbit/forge/grid";
import { astar } from "../astar.ts";
import { chaser_c, path_c, player_c, state_c } from "../components.ts";
import { g } from "../grid.ts";
import { creature_occupancy_r, hitstop_r, progress_r, wall_index_r } from "../resources.ts";

export const AGGRO_RADIUS = 8;

export const chaser_think_system: System = (w, ctx) => {
	const prog = ctx.res.get(progress_r);
	if (prog.ok && prog.value.paused) return;
	const hs = ctx.res.get(hitstop_r);
	if (hs.ok && hs.value.remaining > 0) return;

	const wi = ctx.res.get(wall_index_r);
	if (!wi.ok) return;
	const walls = wi.value.cells;
	const occ = ctx.res.get(creature_occupancy_r);
	const occupancy = occ.ok ? occ.value.cells : new Set<number>();
	const players = w.query([pos_c, player_c] as const).collect();
	if (players.length === 0) return;
	const pp = players[0]![1];
	const player_cell = g.world_to_cell(pp.x, pp.y);
	const is_blocking = (c: Cell): boolean => walls.has(g.key(c.x, c.y));

	const player_key = g.key(player_cell.x, player_cell.y);
	for (const [id, p, st] of w.query([pos_c, state_c, chaser_c] as const).collect()) {
		const my_cell = g.world_to_cell(p.x, p.y);
		const my_key = g.key(my_cell.x, my_cell.y);
		const passable = (c: Cell): boolean => {
			const k = g.key(c.x, c.y);
			if (walls.has(k)) return false;
			if (k === my_key) return true;
			if (k === player_key) return true;
			if (occupancy.has(k)) return false;
			return true;
		};
		const dist = g.chebyshev(my_cell, player_cell);
		const visible = g.line_of_sight({
			from: my_cell,
			radius: AGGRO_RADIUS,
			is_blocking,
		});
		const has_los = visible.has(g.key(player_cell.x, player_cell.y));

		if (has_los && dist <= AGGRO_RADIUS) {
			w.set(id, state_c, { kind: "chasing" });
			const path = astar(g, my_cell, player_cell, { passable, max_steps: 200 });
			if (path && path.length > 0) w.set(id, path_c, { cells: path, idx: 0 });
			else if (w.has(id, path_c)) w.remove(id, path_c);
		} else {
			w.set(id, state_c, { kind: "idle" });
			if (w.has(id, path_c)) w.remove(id, path_c);
		}
		// `st` (current state) intentionally unused — we overwrite each tick.
		void st;
	}
};
