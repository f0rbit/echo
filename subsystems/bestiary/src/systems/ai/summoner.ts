import type { Id, System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import type { Cell } from "@f0rbit/forge/grid";
import {
	chaser_c,
	dir_c,
	floor_c,
	minion_c,
	minion_link_c,
	state_c,
	summoner_c,
	summoner_state_c,
} from "../../components.ts";
import { g } from "../../grid.ts";
import { arena_r } from "../../resources.ts";

const minion_aggro = 8;
const offsets: readonly Cell[] = [
	{ x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
	{ x: -1, y: 0 }, { x: 1, y: 0 },
	{ x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 },
];

const adjacent_floor_cells = (
	from: Cell,
	floors: ReadonlySet<number>,
	occupied: ReadonlySet<number>,
): readonly Cell[] => {
	const cells: Cell[] = [];
	for (const o of offsets) {
		const c = { x: from.x + o.x, y: from.y + o.y };
		if (!g.in_bounds(c.x, c.y)) continue;
		const k = g.key(c.x, c.y);
		if (!floors.has(k)) continue;
		if (occupied.has(k)) continue;
		cells.push(c);
	}
	return cells;
};

export const summoner_spawn_system: System = (w, ctx) => {
	const arena = ctx.res.get(arena_r);
	if (!arena.ok) return;
	const { floors } = arena.value;
	const tick = ctx.time.tick;

	const occupied = new Set<number>();
	for (const [id, p] of w.query([pos_c] as const).collect()) {
		if (w.has(id, floor_c)) continue;
		const c = g.world_to_cell(p.x, p.y);
		occupied.add(g.key(c.x, c.y));
	}

	const minions_by_source = new Map<Id, number>();
	for (const [, link] of w.query([minion_link_c, minion_c] as const).collect()) {
		minions_by_source.set(link.source_id, (minions_by_source.get(link.source_id) ?? 0) + 1);
	}

	for (const [id, p, st] of w.query([pos_c, summoner_state_c, summoner_c] as const).collect()) {
		if (tick < st.next_spawn_tick) continue;
		const live = minions_by_source.get(id) ?? 0;
		if (live >= st.max_minions) continue;

		const my_cell = g.world_to_cell(p.x, p.y);
		const candidates = adjacent_floor_cells(my_cell, floors, occupied);
		if (candidates.length === 0) continue;

		const picked = ctx.rng.pick(candidates);
		if (!picked.ok) continue;
		const cell = picked.value;
		const at = g.cell_to_world(cell.x, cell.y);

		w.spawn(
			[pos_c, at],
			[chaser_c, true],
			[minion_c, true],
			[dir_c, { dx: 0, dy: 0 }],
			[state_c, { kind: "idle", aggro_radius: minion_aggro }],
			[minion_link_c, { source_id: id }],
		);
		occupied.add(g.key(cell.x, cell.y));
		minions_by_source.set(id, live + 1);

		w.set(id, summoner_state_c, {
			spawn_every: st.spawn_every,
			next_spawn_tick: tick + st.spawn_every,
			max_minions: st.max_minions,
		});
	}
};
