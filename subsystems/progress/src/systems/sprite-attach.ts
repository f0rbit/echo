import type { Component, System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { sprite_c } from "@f0rbit/forge/pixi";
import { chaser_c, player_c } from "../components.ts";

// sprite-attach.ts — mirror of loot/bestiary's cell-step pattern. Each entity
// with a supported marker component (and pos_c) gets a sprite_c written
// exactly once; forge's auto-installed sprite_sync_system then renders it,
// reading visual_pos_c via the boot-config `pos: visual_pos_c` so cell-step
// jumps tween smoothly.
//
// Both progress markers are true markers (Component<true>) — no Component<unknown>
// widening needed (unlike arena, whose projectile_c carries data).

type Tile = {
	marker: Component<true>;
	texture: string;
	frame: string;
	visible: boolean;
	anchor: { x: number; y: number };
	z?: number;
};

const tiles: readonly Tile[] = [
	{ marker: player_c, texture: "dungeon", frame: "knight_m_idle_anim_f0", visible: true, anchor: { x: 0.5, y: 0.75 }, z: 3 },
	{ marker: chaser_c, texture: "dungeon", frame: "goblin_idle_anim_f0", visible: true, anchor: { x: 0.5, y: 0.5 }, z: 3 },
];

export const sprite_attach_system: System = w => {
	for (const { marker, texture, frame, visible, anchor, z } of tiles) {
		for (const [id] of w.query([pos_c, marker] as const)) {
			if (w.has(id, sprite_c)) continue;
			w.set(id, sprite_c, { texture, frame, anchor, visible, z });
		}
	}
};
