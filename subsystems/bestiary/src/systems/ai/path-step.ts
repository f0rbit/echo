import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import type { Cell } from "@f0rbit/forge/grid";
import { dir_c, path_c } from "../../components.ts";
import { g } from "../../grid.ts";
import { arena_r } from "../../resources.ts";

const sign = (n: number): -1 | 0 | 1 => (n > 0 ? 1 : n < 0 ? -1 : 0);

export const path_step_system: System = (w, ctx) => {
	const arena = ctx.res.get(arena_r);
	if (!arena.ok) return;
	const { floors } = arena.value;
	const blocked_by = (c: Cell): boolean => !floors.has(g.key(c.x, c.y));

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
		const r = g.move_tile(w, id, { dx, dy }, { blocked_by });
		if (r.ok && r.value.moved) {
			const new_cell = r.value.to;
			if (new_cell.x === target.x && new_cell.y === target.y) {
				w.set(id, path_c, { cells: pth.cells, index: pth.index + 1 });
			}
		}
	}
};
