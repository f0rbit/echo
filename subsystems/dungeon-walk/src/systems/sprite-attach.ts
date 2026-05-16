import type { Component, System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { sprite_c } from "@f0rbit/forge/pixi";
import { exit_c, floor_c, player_c, wall_c } from "../components.ts";

type Tile = {
	marker: Component<true>;
	texture: string;
	frame: string;
	visible: boolean;
	anchor: { x: number; y: number };
};

const tiles: readonly Tile[] = [
	{ marker: floor_c, texture: "dungeon", frame: "floor_1", visible: true, anchor: { x: 0.5, y: 0.5 } },
	{ marker: wall_c, texture: "dungeon", frame: "wall_mid", visible: true, anchor: { x: 0.5, y: 0.5 } },
	{ marker: exit_c, texture: "dungeon", frame: "floor_ladder", visible: true, anchor: { x: 0.5, y: 0.5 } },
	{ marker: player_c, texture: "dungeon", frame: "knight_m_idle_anim_f0", visible: true, anchor: { x: 0.5, y: 0.75 } },
];

export const sprite_attach_system: System = w => {
	for (const { marker, texture, frame, visible, anchor } of tiles) {
		for (const [id] of w.query([pos_c, marker] as const)) {
			if (w.has(id, sprite_c)) continue;
			w.set(id, sprite_c, { texture, frame, anchor, visible });
		}
	}
};
