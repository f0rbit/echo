import type { System } from "@f0rbit/forge";

// synthetic-perk-pick.ts — replay-bridge mirroring loot's
// synthetic-slot-click.ts (per AGENTS.md "Synthetic action bindings for
// replay-recordable UI clicks").
//
// Why this system exists:
//   The DOM pointerdown handler in main.ts → make_perk_choice_ui calls
//   perks_sys.queue_perk_pick(idx) directly with no action involved. That
//   works for real users but produces no replay events. So the recorder
//   (Phase 5.6) emits press events on `pick_perk_<i>` actions, and this
//   system reads them back on playback.
//
//   For real users, this same path also services the 1/2/3 keyboard
//   bindings (pick_perk_0..2) — input.ts intentionally does NOT read
//   those actions to avoid double-queueing.
//
// Edge: edge-triggered via `ctx.input.just("pick_perk_<i>")` so one press →
// one click, even if a key is held across multiple ticks.
const PICK_PERK_ACTIONS = ["pick_perk_0", "pick_perk_1", "pick_perk_2"] as const;

export const make_synthetic_perk_pick_system = (queue_perk_pick: (idx: number) => void): System => (_w, ctx) => {
	for (let i = 0; i < PICK_PERK_ACTIONS.length; i++) {
		if (ctx.input.just(PICK_PERK_ACTIONS[i]!)) queue_perk_pick(i);
	}
};
