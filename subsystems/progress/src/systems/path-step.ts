// FORGE-PROMOTION-CANDIDATE: copied from
// subsystems/bestiary/src/systems/ai/path-step.ts. progress is the
// 2nd consumer (boss Phase 6 will be the 3rd). Phase 8 (`main`)
// should extract to @f0rbit/forge per AGENTS.md §5 promotion criteria.
//
// Adaptations from the bestiary original:
//   1. Added `progress_r.paused` early-return per .plans/progress.md
//      §2 Q4 — every gameplay system early-returns during level-up.
//   2. progress's `Path` uses `idx` (not `index`).
//   3. queries `chaser_c` directly — no umbrella `enemy_c` in progress.
//
// If you edit this file, sync the change back to bestiary's copy
// (and forward to any other copy that exists). Annotated 2026-05-18.
import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import type { Cell } from "@f0rbit/forge/grid";
import { chaser_c, dir_c, path_c, player_c } from "../components.ts";
import { g } from "../grid.ts";
import { hitstop_r, progress_r, wall_index_r } from "../resources.ts";

const sign = (n: number): -1 | 0 | 1 => (n > 0 ? 1 : n < 0 ? -1 : 0);

export const path_step_system: System = (w, ctx) => {
	const prog = ctx.res.get(progress_r);
	if (prog.ok && prog.value.paused) return;
	const hs = ctx.res.get(hitstop_r);
	if (hs.ok && hs.value.remaining > 0) return;

	const wi = ctx.res.get(wall_index_r);
	if (!wi.ok) return;
	const walls = wi.value.cells;

	const occupancy = new Set<number>();
	for (const [, ep] of w.query([pos_c, chaser_c] as const).collect()) {
		const ec = g.world_to_cell(ep.x, ep.y);
		occupancy.add(g.key(ec.x, ec.y));
	}
	for (const [, pp] of w.query([pos_c, player_c] as const).collect()) {
		const pc = g.world_to_cell(pp.x, pp.y);
		occupancy.add(g.key(pc.x, pc.y));
	}

	for (const [id, p, pth] of w.query([pos_c, path_c] as const).collect()) {
		if (pth.idx >= pth.cells.length) {
			w.remove(id, path_c);
			continue;
		}
		const target = pth.cells[pth.idx]!;
		const cur = g.world_to_cell(p.x, p.y);
		const dx = sign(target.x - cur.x);
		const dy = sign(target.y - cur.y);
		if (w.has(id, dir_c)) w.set(id, dir_c, { dx, dy });
		const cur_key = g.key(cur.x, cur.y);
		const blocked_by = (c: Cell): boolean => {
			const k = g.key(c.x, c.y);
			if (walls.has(k)) return true;
			if (k === cur_key) return false;
			if (occupancy.has(k)) return true;
			return false;
		};
		const r = g.move_tile(w, id, { dx, dy }, { blocked_by });
		if (r.ok && r.value.moved) {
			const new_cell = r.value.to;
			const new_key = g.key(new_cell.x, new_cell.y);
			occupancy.delete(cur_key);
			occupancy.add(new_key);
			if (new_cell.x === target.x && new_cell.y === target.y) {
				w.set(id, path_c, { cells: pth.cells, idx: pth.idx + 1 });
			}
		}
	}
};
