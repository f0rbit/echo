import type { Schedule, System, World } from "@f0rbit/forge";
import { component, pos_c, type Component } from "@f0rbit/forge";
import { sprite_c } from "@f0rbit/forge/pixi";

const player_c: Component<true> = component<true>("bst.player");

const spawn_player_system: System = w => {
	for (const _ of w.query([player_c] as const)) return;
	w.spawn(
		[pos_c, { x: 240, y: 160 }],
		[player_c, true],
		[sprite_c, { texture: "__default__", frame: "__default_0__", anchor: { x: 0.5, y: 0.5 } }],
	);
};

export const game_plugin = (_w: World, sch: Schedule): void => {
	sch.add("startup", spawn_player_system, "bst.spawn_player");
};
