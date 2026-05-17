import type { System } from "@f0rbit/forge";
import { SLOT_CLICK_ACTIONS } from "../bindings.ts";

// synthetic_slot_click_system — bridges replay-recorded inventory clicks
// into the live inventory.queue_click queue (per .plans/loot.md §6 line 568,
// option A).
//
// Why this exists:
//   The DOM pointerdown handler in main.ts → make_inventory_ui calls
//   inv_sys.queue_click(idx) directly with no action involved. That works
//   for real users but produces no replay events. So the recorder
//   (tools/record-equip-and-stat.ts) injects press events on
//   `slot_click_<i>` actions, and this system reads them back on playback.
//
// Edge: the recorder ALSO runs this system on the way out (because it
// boots through `game_plugin`). To avoid double-clicks we only queue when
// `ctx.input.just("slot_click_<i>")` is true (edge-triggered, one click per
// press → release pair). The recorder's helper holds each press for exactly
// one tick before releasing.
export const make_synthetic_slot_click_system = (queue_click: (idx: number) => void): System => (_w, ctx) => {
	for (let i = 0; i < SLOT_CLICK_ACTIONS.length; i++) {
		if (ctx.input.just(SLOT_CLICK_ACTIONS[i]!)) queue_click(i);
	}
};
