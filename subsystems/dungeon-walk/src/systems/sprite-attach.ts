import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { sprite_c } from "@f0rbit/forge/pixi";
import { exit_c, floor_c, player_c } from "../components.ts";

const anchor = { x: 0.5, y: 0.5 } as const;

export const sprite_attach_system: System = w => {
	for (const [id] of w.query([pos_c, floor_c] as const)) {
		if (!w.has(id, sprite_c)) {
			w.set(id, sprite_c, { texture: "__default__", frame: "__default_1__", anchor, visible: false });
		}
	}
	for (const [id] of w.query([pos_c, exit_c] as const)) {
		if (!w.has(id, sprite_c)) {
			w.set(id, sprite_c, { texture: "__default__", frame: "__default_2__", anchor, visible: false });
		}
	}
	for (const [id] of w.query([pos_c, player_c] as const)) {
		if (!w.has(id, sprite_c)) {
			w.set(id, sprite_c, { texture: "__default__", frame: "__default_0__", anchor });
		}
	}
};
