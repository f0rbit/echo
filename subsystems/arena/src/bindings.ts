import { merge_bindings, type Bindings } from "@f0rbit/forge";
import { presets } from "@f0rbit/forge/presets";

const extras: Bindings = {
	digital: {
		melee: [{ kind: "key", code: "KeyZ" }],
		ranged: [{ kind: "key", code: "KeyX" }],
		restart: [{ kind: "key", code: "KeyR" }],
		start_game: [{ kind: "key", code: "Space" }],
		debug_toggle: [{ kind: "key", code: "Tab" }],
	},
	axes: {},
	deadzone: 0,
};

export const game_bindings: Bindings = merge_bindings(presets.movement_2d, extras);
