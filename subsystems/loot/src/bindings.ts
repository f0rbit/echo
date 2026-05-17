import { merge_bindings, type Bindings } from "@f0rbit/forge";
import { presets } from "@f0rbit/forge/presets";

// Synthetic slot-click bindings (per .plans/loot.md §6 line 568, option a).
//
// The DOM UI fires `inventory_system.queue_click(idx)` directly from
// pointerdown — it does NOT go through the action machinery. To make slot
// clicks _replayable_, the recorder emits press events on
// `slot_click_<i>` actions; on playback `synthetic_slot_click_system` reads
// `ctx.input.just("slot_click_<i>")` and forwards to `inventory.queue_click`.
//
// Bound to F1..F12 — real users won't press those during normal play, and
// the recorder maps slot 0..11 → F1..F12 as a sentinel scan code so the
// replay JSON survives a forge bump without re-recording.
const SLOT_CLICK_KEYS = [
	"F1", "F2", "F3", "F4", "F5", "F6",
	"F7", "F8", "F9", "F10", "F11", "F12",
] as const;

export const SLOT_CLICK_ACTIONS: readonly string[] = SLOT_CLICK_KEYS.map((_, i) => `slot_click_${i}`);

const slot_click_bindings: Bindings["digital"] = Object.fromEntries(
	SLOT_CLICK_KEYS.map((code, i) => [`slot_click_${i}`, [{ kind: "key" as const, code }]]),
);

const extras: Bindings = {
	digital: {
		inventory_toggle: [{ kind: "key", code: "KeyI" }],
		restart: [{ kind: "key", code: "KeyR" }],
		debug_toggle: [{ kind: "key", code: "Tab" }],
		...slot_click_bindings,
	},
	axes: {},
	deadzone: 0,
};

export const game_bindings: Bindings = merge_bindings(presets.movement_2d, extras);
