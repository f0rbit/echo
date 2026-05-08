import { merge_bindings, type Bindings } from "@f0rbit/forge";
import { presets } from "@f0rbit/forge/presets";

const extras: Bindings = {
	digital: {
		restart: [{ kind: "key", code: "KeyR" }],
		debug_toggle: [{ kind: "key", code: "Tab" }],
	},
	axes: {},
	deadzone: 0,
};

export const game_bindings: Bindings = merge_bindings(presets.movement_2d, extras);
