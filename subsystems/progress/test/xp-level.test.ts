import { describe, expect, test } from "bun:test";
import { make_progress_scenario } from "./fixtures/progress-scenario.ts";
import { make_xp_system, XP_BASE_PER_KILL } from "../src/systems/xp.ts";
import { stats_c, xp_c } from "../src/components.ts";
import { level_up_pending_r, progress_r } from "../src/resources.ts";

describe("progress xp — gain + level-up", () => {
	test("single kill grants 25 XP base", () => {
		const { h, player_id, tick } = make_progress_scenario({ with_player: true });
		const xp_sys = make_xp_system();
		h.schedule.add("update", xp_sys.system, { name: "xp" });
		xp_sys.emit_xp_gain(XP_BASE_PER_KILL);
		tick();
		const xp = h.world.get(player_id!, xp_c);
		const prog = h.res.get(progress_r);
		if (!xp.ok || !prog.ok) return;
		expect(xp.value.current).toBe(25);
		expect(xp.value.level).toBe(1);
		expect(prog.value.paused).toBe(false);
	});

	test("reaching threshold triggers level-up + 3 perk choices + paused", () => {
		const { h, player_id, tick } = make_progress_scenario({ with_player: true });
		const xp_sys = make_xp_system();
		h.schedule.add("update", xp_sys.system, { name: "xp" });
		xp_sys.emit_xp_gain(100);
		tick();
		const xp = h.world.get(player_id!, xp_c);
		const prog = h.res.get(progress_r);
		const lvl = h.res.get(level_up_pending_r);
		if (!xp.ok || !prog.ok || !lvl.ok) return;
		expect(xp.value.level).toBe(2);
		expect(xp.value.current).toBe(0);
		expect(prog.value.paused).toBe(true);
		expect(lvl.value.pending).toBe(true);
		expect(lvl.value.choices.length).toBe(3);
		// Choices must be distinct perk ids.
		expect(new Set(lvl.value.choices).size).toBe(3);
	});

	test("overflow XP carries into the new level", () => {
		const { h, player_id, tick } = make_progress_scenario({ with_player: true });
		const xp_sys = make_xp_system();
		h.schedule.add("update", xp_sys.system, { name: "xp" });
		xp_sys.emit_xp_gain(150);
		tick();
		const xp = h.world.get(player_id!, xp_c);
		const prog = h.res.get(progress_r);
		if (!xp.ok || !prog.ok) return;
		expect(xp.value.level).toBe(2);
		expect(xp.value.current).toBe(50);
		expect(prog.value.paused).toBe(true);
	});

	test("xp_gain_mul from stats_c multiplies incoming xp", () => {
		const { h, player_id, tick } = make_progress_scenario({ with_player: true });
		const stats_before = h.world.get(player_id!, stats_c);
		if (!stats_before.ok) return;
		h.world.set(player_id!, stats_c, { ...stats_before.value, xp_gain_mul: 0.25 });

		const xp_sys = make_xp_system();
		h.schedule.add("update", xp_sys.system, { name: "xp" });
		xp_sys.emit_xp_gain(100);
		tick();
		// 100 * (1 + 0.25) = 125 → level up at threshold 100, current = 25.
		const xp = h.world.get(player_id!, xp_c);
		const prog = h.res.get(progress_r);
		if (!xp.ok || !prog.ok) return;
		expect(xp.value.level).toBe(2);
		expect(xp.value.current).toBe(25);
		expect(prog.value.paused).toBe(true);
	});

	test("multi-level-up: at most ONE level-up per tick — excess sits in current", () => {
		const { h, player_id, tick } = make_progress_scenario({ with_player: true });
		const xp_sys = make_xp_system();
		h.schedule.add("update", xp_sys.system, { name: "xp" });
		// 300 XP at level 1: threshold(1)=100. After one level-up, current=200,
		// level=2. threshold(2)=200, so we ARE over the next threshold — but
		// policy is one level-up per tick. State must stop at level 2.
		xp_sys.emit_xp_gain(300);
		tick();
		const xp = h.world.get(player_id!, xp_c);
		const prog = h.res.get(progress_r);
		if (!xp.ok || !prog.ok) return;
		expect(xp.value.level).toBe(2);
		expect(xp.value.current).toBe(200);
		expect(prog.value.paused).toBe(true);
	});

	test("queued xp_gain is still processed on the kill tick that triggers level-up", () => {
		// melee-swing emits BEFORE xp.ts runs on the same tick. xp must not
		// gate on paused — it must drain the queue first, set paused after.
		const { h, player_id, tick } = make_progress_scenario({ with_player: true });
		const xp_sys = make_xp_system();
		h.schedule.add("update", xp_sys.system, { name: "xp" });
		// Multiple kills on the same tick → all consumed; level-up fires once.
		xp_sys.emit_xp_gain(60);
		xp_sys.emit_xp_gain(60);
		tick();
		const xp = h.world.get(player_id!, xp_c);
		const prog = h.res.get(progress_r);
		if (!xp.ok || !prog.ok) return;
		expect(xp.value.level).toBe(2);
		expect(xp.value.current).toBe(20);
		expect(prog.value.paused).toBe(true);
	});
});
