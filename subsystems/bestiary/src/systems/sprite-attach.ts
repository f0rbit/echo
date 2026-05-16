import type { Component, System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { sprite_c } from "@f0rbit/forge/pixi";
import {
	chaser_c,
	floor_c,
	minion_c,
	patroller_c,
	player_c,
	ranged_c,
	summoner_c,
} from "../components.ts";

const anchor = { x: 0.5, y: 0.5 } as const;

type Tile = {
	marker: Component<true>;
	frame: string;
	visible: boolean;
	tint?: number;
	scale?: { x: number; y: number };
};

const tiles: readonly Tile[] = [
	{ marker: floor_c, frame: "__default_1__", visible: true },
	{ marker: player_c, frame: "__default_0__", visible: true },
	{ marker: minion_c, frame: "__default_2__", visible: true, tint: 0xffff66, scale: { x: 0.6, y: 0.6 } },
	{ marker: summoner_c, frame: "__default_2__", visible: true, tint: 0x8800ff, scale: { x: 2, y: 2 } },
	{ marker: chaser_c, frame: "__default_2__", visible: true },
	{ marker: patroller_c, frame: "__default_2__", visible: true, tint: 0xff8000 },
	{ marker: ranged_c, frame: "__default_2__", visible: true, tint: 0x00ff00 },
];

export const sprite_attach_system: System = w => {
	for (const { marker, frame, visible, tint, scale } of tiles) {
		for (const [id] of w.query([pos_c, marker] as const)) {
			if (w.has(id, sprite_c)) continue;
			w.set(id, sprite_c, { texture: "__default__", frame, anchor, visible, tint, scale });
		}
	}
};
