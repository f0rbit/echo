import type { Component, System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { sprite_c } from "@f0rbit/forge/pixi";
import { exit_c, floor_c, player_c } from "../components.ts";

type Tile = {
	marker: Component<true>;
	texture: string;
	frame: string;
	visible: boolean;
	anchor: { x: number; y: number };
	z?: number;
};

const tiles: readonly Tile[] = [
	{ marker: floor_c, texture: "dungeon", frame: "floor_1", visible: true, anchor: { x: 0.5, y: 0.5 }, z: 1 },
	{ marker: exit_c, texture: "dungeon", frame: "floor_ladder", visible: true, anchor: { x: 0.5, y: 0.5 }, z: 2 },
	{ marker: player_c, texture: "dungeon", frame: "knight_m_idle_anim_f0", visible: true, anchor: { x: 0.5, y: 0.75 }, z: 3 },
];

export const sprite_attach_system: System = w => {
	for (const { marker, texture, frame, visible, anchor, z } of tiles) {
		for (const [id] of w.query([pos_c, marker] as const)) {
			if (w.has(id, sprite_c)) continue;
			w.set(id, sprite_c, { texture, frame, anchor, visible, z });
		}
	}
};
