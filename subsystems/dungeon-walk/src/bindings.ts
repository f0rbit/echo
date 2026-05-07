import { merge_bindings, type Bindings } from "@f0rbit/forge";
import { presets } from "@f0rbit/forge/presets";

const restart_only: Bindings = {
	digital: { restart: [{ kind: "key", code: "KeyR" }] },
	axes: {},
	deadzone: 0.15,
};

export const game_bindings: Bindings = merge_bindings(presets.movement_2d, restart_only);
