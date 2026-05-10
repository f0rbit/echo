import type { Component, System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { sprite } from "@f0rbit/forge/pixi";
import {
	chaser_c,
	floor_c,
	minion_c,
	patroller_c,
	player_c,
	ranged_c,
	summoner_c,
	visual_pos_c,
} from "../components.ts";
import { g } from "../grid.ts";
import { arena_r } from "../resources.ts";

export const fov_radius = 6;

const lit_markers: readonly Component<true>[] = [
	floor_c,
	chaser_c,
	patroller_c,
	ranged_c,
	summoner_c,
	minion_c,
];

export const fov_system: System = (w, ctx) => {
	const arena = ctx.res.get(arena_r);
	if (!arena.ok) return;

	const players = w.query([pos_c, player_c] as const).collect();
	if (players.length === 0) return;
	const player_id = players[0]![0];
	const player_pos = players[0]![1];
	const visual = w.get(player_id, visual_pos_c);
	const player_visual = visual.ok ? visual.value : player_pos;

	const player_cell = g.world_to_cell(player_visual.x, player_visual.y);
	const visible = g.line_of_sight({
		from: player_cell,
		radius: fov_radius,
		is_blocking: cell => !arena.value.floors.has(g.key(cell.x, cell.y)),
	});

	for (const marker of lit_markers) {
		for (const [id, p] of w.query([pos_c, marker] as const).collect()) {
			const c = g.world_to_cell(p.x, p.y);
			if (!visible.has(g.key(c.x, c.y))) {
				sprite.set(w, id, { alpha: 0, visible: false });
				continue;
			}
			sprite.set(w, id, { alpha: 1, visible: true });
		}
	}

	for (const [id] of w.query([pos_c, player_c] as const).collect()) {
		sprite.set(w, id, { alpha: 1, visible: true });
	}
};
