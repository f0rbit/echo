import type { Component, System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { sprite_c } from "@f0rbit/forge/pixi";
import { floor_c, player_c } from "../components.ts";

const anchor = { x: 0.5, y: 0.5 } as const;

const tiles: readonly [Component<true>, string, boolean][] = [
	[floor_c, "__default_1__", false],
	[player_c, "__default_0__", true],
];

export const sprite_attach_system: System = w => {
	for (const [marker, frame, visible] of tiles) {
		for (const [id] of w.query([pos_c, marker] as const)) {
			if (w.has(id, sprite_c)) continue;
			w.set(id, sprite_c, { texture: "__default__", frame, anchor, visible });
		}
	}
};
