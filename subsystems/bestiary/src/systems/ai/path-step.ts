import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import type { Cell } from "@f0rbit/forge/grid";
import { dir_c, enemy_c, path_c, player_c } from "../../components.ts";
import { g } from "../../grid.ts";
import { arena_r } from "../../resources.ts";

const sign = (n: number): -1 | 0 | 1 => (n > 0 ? 1 : n < 0 ? -1 : 0);

export const path_step_system: System = (w, ctx) => {
	const arena = ctx.res.get(arena_r);
	if (!arena.ok) return;
	const { floors } = arena.value;

	const occupancy = new Set<number>();
	for (const [, ep] of w.query([pos_c, enemy_c] as const).collect()) {
		const ec = g.world_to_cell(ep.x, ep.y);
		occupancy.add(g.key(ec.x, ec.y));
	}
	for (const [, pp] of w.query([pos_c, player_c] as const).collect()) {
		const pc = g.world_to_cell(pp.x, pp.y);
		occupancy.add(g.key(pc.x, pc.y));
	}

	for (const [id, p, pth] of w.query([pos_c, path_c] as const).collect()) {
		if (pth.index >= pth.cells.length) {
			w.remove(id, path_c);
			continue;
		}
		const target = pth.cells[pth.index]!;
		const cur = g.world_to_cell(p.x, p.y);
		const dx = sign(target.x - cur.x);
		const dy = sign(target.y - cur.y);
		if (w.has(id, dir_c)) w.set(id, dir_c, { dx, dy });
		const cur_key = g.key(cur.x, cur.y);
		const blocked_by = (c: Cell): boolean => {
			const k = g.key(c.x, c.y);
			if (!floors.has(k)) return true;
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
				w.set(id, path_c, { cells: pth.cells, index: pth.index + 1 });
			}
		}
	}
};
