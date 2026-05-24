import { describe, expect, test } from "bun:test";
import { pos_c } from "@f0rbit/forge";
import { chaser_c, dir_c, hp_c, state_c, visual_pos_c } from "../src/components.ts";
import { g } from "../src/grid.ts";
import { swing_state_r } from "../src/resources.ts";
import { make_melee_swing_system, SWING_WINDOW_TICKS } from "../src/systems/melee-swing.ts";
import { make_xp_system } from "../src/systems/xp.ts";
import { make_progress_scenario } from "./fixtures/progress-scenario.ts";

// The window has to outlast the typical chaser approach cadence so that
// a Z press fired before adjacency still lands when the chaser closes.
// Path-step ticks every 6 frames; the window spans 2-3 chaser steps.
//
// `harness.tick()` runs only the update stage and does NOT call
// `input.advance()` — see echo AGENTS.md "harness.tick() only runs the
// update stage". So tests must call `h.input.pump([])` manually before
// each tick to drive `just_pressed` edges off injected actions.

const advance = (h: ReturnType<typeof make_progress_scenario>["h"], tick: () => void): void => {
	h.input.pump([]);
	tick();
};

describe("progress melee — swing window", () => {
	test("Z press queues a window; chaser entering range during it dies", () => {
		// Place player; press Z while no chaser is adjacent. Then move a
		// chaser into chebyshev-1 range BEFORE the window expires. The
		// chaser should die — exactly the case the bug fix targets.
		const { h, tick } = make_progress_scenario({ with_player: true });
		const xp_sys = make_xp_system();
		h.schedule.add("update", make_melee_swing_system(xp_sys), { name: "melee" });

		const player_cell = { x: Math.floor(g.cols / 2), y: Math.floor(g.rows / 2) };

		// Tick 1: press Z with no chaser anywhere. Window opens.
		h.input.inject_actions([{ kind: "press", action: "swing" }]);
		advance(h, tick);
		h.input.inject_actions([{ kind: "release", action: "swing" }]);
		const ss_press = h.res.get(swing_state_r);
		expect(ss_press.ok).toBe(true);
		if (!ss_press.ok) return;
		expect(ss_press.value.active_until_tick).toBeGreaterThan(h.time.tick);

		// Spawn a chaser at chebyshev-1 (player+1, player). Tick — should die.
		const adj_pos = g.cell_to_world(player_cell.x + 1, player_cell.y);
		const chaser_id = h.world.spawn(
			[chaser_c, true],
			[pos_c, adj_pos],
			[visual_pos_c, { ...adj_pos }],
			[dir_c, { dx: 0, dy: 0 }],
			[hp_c, { current: 1, max: 1 }],
			[state_c, { kind: "idle" }],
		);
		advance(h, tick);
		expect(h.world.get(chaser_id, pos_c).ok).toBe(false);
		const ss_kill = h.res.get(swing_state_r);
		expect(ss_kill.ok).toBe(true);
		if (ss_kill.ok) expect(ss_kill.value.active_until_tick).toBe(0);
	});

	test("Z press with no adjacent chaser within window expires harmlessly", () => {
		const { h, tick } = make_progress_scenario({ with_player: true });
		const xp_sys = make_xp_system();
		h.schedule.add("update", make_melee_swing_system(xp_sys), { name: "melee" });

		h.input.inject_actions([{ kind: "press", action: "swing" }]);
		advance(h, tick);
		const tick_after_press = h.time.tick;
		h.input.inject_actions([{ kind: "release", action: "swing" }]);
		const ss_after_press = h.res.get(swing_state_r);
		expect(ss_after_press.ok).toBe(true);
		if (ss_after_press.ok) {
			expect(ss_after_press.value.active_until_tick).toBe(tick_after_press + SWING_WINDOW_TICKS);
		}

		// Advance past the window with no chasers around.
		for (let i = 0; i < SWING_WINDOW_TICKS + 2; i++) advance(h, tick);
		const ss_expired = h.res.get(swing_state_r);
		expect(ss_expired.ok).toBe(true);
		if (ss_expired.ok) {
			expect(h.time.tick).toBeGreaterThanOrEqual(ss_expired.value.active_until_tick);
		}
	});

	test("one Z press kills at most one chaser even with multiple adjacent", () => {
		// Two chasers both at chebyshev-1 simultaneously. A single Z press
		// kills exactly one — the player must re-press to fell the second.
		// This preserves the design intent (Z is a single-target swing, not
		// an AoE pulse).
		const { h, tick } = make_progress_scenario({ with_player: true });
		const xp_sys = make_xp_system();
		h.schedule.add("update", make_melee_swing_system(xp_sys), { name: "melee" });

		const player_cell = { x: Math.floor(g.cols / 2), y: Math.floor(g.rows / 2) };
		const c1_pos = g.cell_to_world(player_cell.x + 1, player_cell.y);
		const c2_pos = g.cell_to_world(player_cell.x - 1, player_cell.y);
		const c1 = h.world.spawn(
			[chaser_c, true],
			[pos_c, c1_pos],
			[visual_pos_c, { ...c1_pos }],
			[dir_c, { dx: 0, dy: 0 }],
			[hp_c, { current: 1, max: 1 }],
			[state_c, { kind: "idle" }],
		);
		const c2 = h.world.spawn(
			[chaser_c, true],
			[pos_c, c2_pos],
			[visual_pos_c, { ...c2_pos }],
			[dir_c, { dx: 0, dy: 0 }],
			[hp_c, { current: 1, max: 1 }],
			[state_c, { kind: "idle" }],
		);

		h.input.inject_actions([{ kind: "press", action: "swing" }]);
		advance(h, tick);
		h.input.inject_actions([{ kind: "release", action: "swing" }]);
		const c1_alive = h.world.get(c1, pos_c).ok;
		const c2_alive = h.world.get(c2, pos_c).ok;
		expect(c1_alive !== c2_alive).toBe(true);
		const ss = h.res.get(swing_state_r);
		expect(ss.ok).toBe(true);
		if (ss.ok) expect(ss.value.active_until_tick).toBe(0);
	});
});
