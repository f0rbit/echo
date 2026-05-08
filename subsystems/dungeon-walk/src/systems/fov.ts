import type { Component, System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { sprite } from "@f0rbit/forge/pixi";
import { exit_c, floor_c, player_c } from "../components.ts";
import { g } from "../grid.ts";
import { dungeon_r } from "../resources.ts";

const fov_radius = 6;

const falloff = (distance: number, max: number): number =>
	Math.max(0, 1 - (distance / max) ** 1.5);

const lit_markers: readonly Component<true>[] = [floor_c, exit_c];

export const fov_system: System = (w, ctx) => {
	const dungeon = ctx.res.get(dungeon_r);
	if (!dungeon.ok) return;

	const players = w.query([pos_c, player_c] as const).collect();
	if (players.length === 0) return;
	const pp = players[0]![1];
	const lit = g.lit_area({
		from: g.world_to_cell(pp.x, pp.y),
		radius: fov_radius,
		is_blocking: cell => !dungeon.value.floors.has(g.key(cell.x, cell.y)),
		falloff,
	});

	for (const marker of lit_markers) {
		for (const [id, p] of w.query([pos_c, marker] as const).collect()) {
			const c = g.world_to_cell(p.x, p.y);
			const intensity = lit.get(g.key(c.x, c.y)) ?? 0;
			sprite.set(w, id, { alpha: intensity, visible: intensity > 0 });
		}
	}

	for (const [id] of w.query([pos_c, player_c] as const).collect()) {
		sprite.set(w, id, { alpha: 1, visible: true });
	}
};
