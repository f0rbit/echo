import { writeFileSync } from "node:fs";
import { harness, pos_c, replay } from "@f0rbit/forge";
import { equipment_c, inventory_c, player_c, stats_c } from "../src/components.ts";
import { game_bindings, SLOT_CLICK_ACTIONS } from "../src/bindings.ts";
import { game_plugin } from "../src/plugin.ts";
import { g } from "../src/grid.ts";
import { inventory_ui_r } from "../src/resources.ts";

/**
 * Scripted-input recorder for the loot replay-as-test fixture (Phase 4.5).
 *
 * Sequence at seed=1 (deterministic — see arena-gen.ts):
 *   1. boot
 *   2. walk west then north-west to pick up:
 *        slot 0 → item.mace_heavy        (weapon, atk +5)
 *        slot 1 → item.ring_of_power     (ring,   atk +1)
 *        slot 2 → item.ring_of_warding   (ring,   def +1)
 *   3. press I  → inventory_ui_r.open = true
 *   4. emit synthetic slot_click_0 → equip mace as weapon
 *   5. emit synthetic slot_click_1 → equip ring_of_power as ring1
 *   6. emit synthetic slot_click_2 → equip ring_of_warding as ring2
 *   7. run on past the last action so any pending edges drain
 *
 * Synthetic slot_click_<i> bindings are mapped to F1..F12 in bindings.ts;
 * the recorder injects press/release events on those actions so the replay
 * JSON survives without extending the replay schema (per .plans/loot.md §6
 * line 568, option a).
 *
 * Snapshot is NOT recorded as a replay event — it's a test-side concern
 * (the test calls snapper.take() at a chosen tick during playback).
 */

const SEED = 1;
const FIXED_DT = 1 / 60;
const SAFETY_CAP = 4000;
const STEP_TICKS = 10;

type Step = -1 | 0 | 1;

const SIGN = (n: number): Step => (n > 0 ? 1 : n < 0 ? -1 : 0);

// Cells the player walks through; the last entry of each "leg" is a pickup.
const WALK_TARGETS: ReadonlyArray<{ x: number; y: number }> = [
	{ x: 10, y: 6 },
	{ x: 9, y: 6 },
	{ x: 8, y: 6 },
	{ x: 7, y: 6 },
	{ x: 6, y: 6 },
	{ x: 5, y: 6 }, // pickup mace_heavy
	{ x: 5, y: 5 },
	{ x: 4, y: 5 },
	{ x: 3, y: 5 }, // pickup ring_of_power
	{ x: 2, y: 5 },
	{ x: 1, y: 5 },
	{ x: 1, y: 4 }, // pickup ring_of_warding
];

// Click sequence: slot indices to click after opening the inventory.
const SLOT_CLICKS: readonly number[] = [0, 1, 2];

// Tick after the last walk step (12 steps × 10 ticks = step 12 lands on tick 121).
const WALK_END_TICK = 1 + STEP_TICKS * WALK_TARGETS.length;
// Open inventory a few ticks after walk ends.
const OPEN_TICK = WALK_END_TICK + 4;
// First click 4 ticks after open; subsequent clicks every 6 ticks.
const CLICK_BASE_TICK = OPEN_TICK + 4;
const CLICK_STRIDE = 6;
// End the replay a few ticks past the last click.
const END_TICK = CLICK_BASE_TICK + CLICK_STRIDE * SLOT_CLICKS.length + 10;

const h = harness({ seed: SEED, fixed_dt: FIXED_DT, bindings: game_bindings });
const recorder = replay.record(h.input, h.ctx, { seed: SEED });

const inv_sys = game_plugin(h.world, h.schedule);
// queue_click also runs through synthetic_slot_click_system when the
// action edge fires — the recorder relies on that path, NOT a direct
// inv_sys.queue_click call. The local reference is unused; we keep it so
// the plugin's option contract stays identical to main.ts.
void inv_sys;

// Boot tick — mirrors arena's recorder. This consumes startup systems and
// puts the world into a stable post-arena_gen state at tick=1.
h.time.advance(FIXED_DT);
h.schedule.tick(h.world, h.ctx);

let cur_dx: Step = 0;
let cur_dy: Step = 0;
let step_idx = 0;
let cur_cell = { x: Math.floor(g.cols / 2), y: Math.floor(g.rows / 2) };
let open_pressed = false;
let inventory_opened_at = -1;
const clicks_fired = new Set<number>();
const click_held: Map<number, number> = new Map(); // action_idx → release_tick

const set_axis = (next_dx: Step, next_dy: Step): void => {
	if (next_dx !== cur_dx) {
		h.input.inject_actions([{ kind: "axis", action: "move.x", value: next_dx }]);
		cur_dx = next_dx;
	}
	if (next_dy !== cur_dy) {
		h.input.inject_actions([{ kind: "axis", action: "move.y", value: next_dy }]);
		cur_dy = next_dy;
	}
};

const press_action = (action: string): void => {
	h.input.inject_actions([{ kind: "press", action }]);
};

const release_action = (action: string): void => {
	h.input.inject_actions([{ kind: "release", action }]);
};

const player_cell = (): { x: number; y: number } | null => {
	for (const [, p] of h.world.query([player_c, pos_c] as const).collect()) {
		return g.world_to_cell(p.x, p.y);
	}
	return null;
};

for (let i = 0; i < SAFETY_CAP; i++) {
	const tick = h.time.tick;

	// Walk phase: drive axis toward the next target until we've reached the
	// last waypoint.
	if (step_idx < WALK_TARGETS.length) {
		const t = WALK_TARGETS[step_idx]!;
		const dx = SIGN(t.x - cur_cell.x);
		const dy = SIGN(t.y - cur_cell.y);
		set_axis(dx, dy);
	} else {
		set_axis(0, 0);
	}

	// Open inventory once at OPEN_TICK.
	if (!open_pressed && tick === OPEN_TICK) {
		press_action("inventory_toggle");
		open_pressed = true;
	}
	// Release inventory_toggle one tick later so it's a clean edge.
	if (open_pressed && tick === OPEN_TICK + 1) {
		release_action("inventory_toggle");
	}

	// Synthetic slot clicks: emit press; release one tick later. Edge-triggered
	// `just()` in synthetic_slot_click_system fires once per press.
	for (let c = 0; c < SLOT_CLICKS.length; c++) {
		const click_tick = CLICK_BASE_TICK + c * CLICK_STRIDE;
		const slot_idx = SLOT_CLICKS[c]!;
		const action = SLOT_CLICK_ACTIONS[slot_idx]!;
		if (!clicks_fired.has(c) && tick === click_tick) {
			press_action(action);
			click_held.set(slot_idx, click_tick + 1);
			clicks_fired.add(c);
		}
	}
	for (const [slot_idx, release_tick] of Array.from(click_held.entries())) {
		if (tick === release_tick) {
			release_action(SLOT_CLICK_ACTIONS[slot_idx]!);
			click_held.delete(slot_idx);
		}
	}

	h.time.advance(FIXED_DT);
	h.schedule.tick(h.world, h.ctx);

	const cell = player_cell();
	if (!cell) throw new Error(`player vanished at tick ${h.time.tick}`);
	if (cell.x !== cur_cell.x || cell.y !== cur_cell.y) {
		cur_cell = cell;
		if (step_idx < WALK_TARGETS.length) {
			const t = WALK_TARGETS[step_idx]!;
			if (cell.x === t.x && cell.y === t.y) step_idx++;
		}
	}

	// Track when inventory opened (for the log line).
	if (inventory_opened_at === -1) {
		const ui = h.ctx.res.get(inventory_ui_r);
		if (ui.ok && ui.value.open) inventory_opened_at = h.time.tick;
	}

	if (h.time.tick >= END_TICK) break;
}

set_axis(0, 0);
h.time.advance(FIXED_DT);
h.schedule.tick(h.world, h.ctx);

const final_inv = (() => {
	for (const [, inv] of h.world.query([player_c, inventory_c] as const).collect()) return inv;
	return null;
})();
const final_eq = (() => {
	for (const [, , eq] of h.world.query([player_c, stats_c, equipment_c] as const).collect()) return eq;
	return null;
})();
const final_stats = (() => {
	for (const [, st] of h.world.query([player_c, stats_c] as const).collect()) return st;
	return null;
})();

if (!final_inv || !final_eq || !final_stats) throw new Error("missing player state at end of recording");
if (final_eq.weapon !== "item.mace_heavy") throw new Error(`expected weapon mace_heavy, got ${final_eq.weapon}`);
if (final_eq.ring1 !== "item.ring_of_power") throw new Error(`expected ring1 ring_of_power, got ${final_eq.ring1}`);
if (final_eq.ring2 !== "item.ring_of_warding") throw new Error(`expected ring2 ring_of_warding, got ${final_eq.ring2}`);

const doc = recorder.stop();
const json = replay.save(doc);
const out_path = new URL("../replays/equip-and-stat.replay.json", import.meta.url).pathname;
writeFileSync(out_path, json + "\n");

console.log(
	`recorded ${doc.frames.length} frames; walked to ${WALK_TARGETS.length} cells; inventory opened at tick ${inventory_opened_at}; end tick ${h.time.tick}; final stats=${JSON.stringify(final_stats)} -> ${out_path}`,
);
