import type { Component, System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { sprite_c } from "@f0rbit/forge/pixi";
import { chaser_c, dummy_c, player_c, projectile_c } from "../components.ts";

// sprite-attach.ts — mirror of bestiary/loot pattern. Each entity with a
// supported marker (and pos_c) gets a sprite_c written exactly once; forge's
// auto-installed sprite_sync_system then renders it.
//
// swing_c is intentionally NOT in this table — the arc wedge depends on
// angle + radius and stays as Graphics in overlay-render.ts.

// `marker` is widened to `Component<unknown>` (vs. bestiary/loot's
// `Component<true>`) because arena's `projectile_c` carries data (speed +
// radius) — it's not a true marker. The query only uses presence, so the
// component's payload type is irrelevant here.
type Tile = {
	marker: Component<unknown>;
	texture: string;
	frame: string;
	visible: boolean;
	anchor: { x: number; y: number };
	z?: number;
};

const tiles: readonly Tile[] = [
	{ marker: player_c, texture: "dungeon", frame: "knight_m_idle_anim_f0", visible: true, anchor: { x: 0.5, y: 0.75 }, z: 3 },
	{ marker: dummy_c, texture: "dungeon", frame: "chest_empty_open_anim_f0", visible: true, anchor: { x: 0.5, y: 0.5 }, z: 3 },
	{ marker: chaser_c, texture: "dungeon", frame: "goblin_idle_anim_f0", visible: true, anchor: { x: 0.5, y: 0.5 }, z: 3 },
	{ marker: projectile_c, texture: "dungeon", frame: "bomb_f0", visible: true, anchor: { x: 0.5, y: 0.5 }, z: 4 },
];

export const sprite_attach_system: System = w => {
	for (const { marker, texture, frame, visible, anchor, z } of tiles) {
		for (const [id] of w.query([pos_c, marker] as const)) {
			if (w.has(id, sprite_c)) continue;
			w.set(id, sprite_c, { texture, frame, anchor, visible, z });
		}
	}
};
