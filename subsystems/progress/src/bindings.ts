import { merge_bindings, type Bindings } from "@f0rbit/forge";
import { presets } from "@f0rbit/forge/presets";

// Bindings per .plans/progress.md §5 Phase 5.0:
//   movement_2d preset → WASD/arrow movement
//   swing            → Z (melee kill in dir_c)
//   pick_perk_0..2   → 1/2/3 during level-up perk choice
//   restart          → R
//   debug_toggle     → Tab
//
// Save/load are palette-only commands (Phase 5.5) — no key bindings.
const extras: Bindings = {
	digital: {
		swing: [{ kind: "key", code: "KeyZ" }],
		pick_perk_0: [{ kind: "key", code: "Digit1" }],
		pick_perk_1: [{ kind: "key", code: "Digit2" }],
		pick_perk_2: [{ kind: "key", code: "Digit3" }],
		restart: [{ kind: "key", code: "KeyR" }],
		debug_toggle: [{ kind: "key", code: "Tab" }],
	},
	axes: {},
	deadzone: 0,
};

export const game_bindings: Bindings = merge_bindings(presets.movement_2d, extras);
