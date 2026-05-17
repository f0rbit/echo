import { describe, expect, test } from "bun:test";
import { make_progress_scenario, make_test_registry } from "./fixtures/progress-scenario.ts";
import { BASE_STATS, compute_stats, make_stats_recompute_system } from "../src/systems/stats.ts";
import { perks_c, stats_c, type Perks } from "../src/components.ts";
import { progress_r } from "../src/resources.ts";

const empty: Perks = { applied: [] };
const with_perks = (ids: readonly string[]): Perks => ({ applied: ids });

describe("compute_stats — composition (5 perks)", () => {
	test("no perks → stats === base", () => {
		const reg = make_test_registry();
		expect(compute_stats(BASE_STATS, empty, reg)).toEqual(BASE_STATS);
	});

	test("perk.atk_plus → atk +3", () => {
		const reg = make_test_registry();
		const out = compute_stats(BASE_STATS, with_perks(["perk.atk_plus"]), reg);
		expect(out.atk).toBe(8);
		expect(out.def).toBe(2);
		expect(out.spd).toBeCloseTo(1.0, 10);
		expect(out.max_hp).toBe(10);
	});

	test("perk.def_plus → def +2", () => {
		const reg = make_test_registry();
		const out = compute_stats(BASE_STATS, with_perks(["perk.def_plus"]), reg);
		expect(out.def).toBe(4);
	});

	test("perk.spd_plus → spd ×1.15", () => {
		const reg = make_test_registry();
		const out = compute_stats(BASE_STATS, with_perks(["perk.spd_plus"]), reg);
		expect(out.spd).toBeCloseTo(1.15, 10);
	});

	test("perk.hp_plus → max_hp +5 (current-hp untouched here; perks.ts owns that)", () => {
		const reg = make_test_registry();
		const out = compute_stats(BASE_STATS, with_perks(["perk.hp_plus"]), reg);
		expect(out.max_hp).toBe(15);
	});

	test("perk.xp_gain → xp_gain_mul +0.25", () => {
		const reg = make_test_registry();
		const out = compute_stats(BASE_STATS, with_perks(["perk.xp_gain"]), reg);
		expect(out.xp_gain_mul).toBeCloseTo(0.25, 10);
	});

	test("two perk.spd_plus stack multiplicatively (1.15 × 1.15 = 1.3225)", () => {
		const reg = make_test_registry();
		const out = compute_stats(BASE_STATS, with_perks(["perk.spd_plus", "perk.spd_plus"]), reg);
		expect(out.spd).toBeCloseTo(1.3225, 10);
	});

	test("all 5 perks unique → composed atk 8, def 4, max_hp 15, spd 1.15, xp_gain_mul 0.25", () => {
		const reg = make_test_registry();
		const out = compute_stats(BASE_STATS, with_perks([
			"perk.atk_plus",
			"perk.def_plus",
			"perk.spd_plus",
			"perk.hp_plus",
			"perk.xp_gain",
		]), reg);
		expect(out.atk).toBe(8);
		expect(out.def).toBe(4);
		expect(out.max_hp).toBe(15);
		expect(out.spd).toBeCloseTo(1.15, 10);
		expect(out.xp_gain_mul).toBeCloseTo(0.25, 10);
	});

	test("empty applied list returns base (no aliasing — fresh object)", () => {
		const reg = make_test_registry();
		const out = compute_stats(BASE_STATS, empty, reg);
		expect(out).toEqual(BASE_STATS);
		expect(out).not.toBe(BASE_STATS);
	});

	test("unknown perk id is silently skipped (registry lookup miss)", () => {
		const reg = make_test_registry();
		const out = compute_stats(BASE_STATS, with_perks(["perk.does_not_exist"]), reg);
		expect(out).toEqual(BASE_STATS);
	});
});

describe("make_stats_recompute_system — gated on dirty_stats", () => {
	test("dirty_stats=true + perks_c.applied → stats recomputed, dirty cleared", () => {
		const { h, player_id, tick } = make_progress_scenario({ with_player: true });
		h.world.set(player_id!, perks_c, { applied: ["perk.atk_plus"] });
		const prog_before = h.res.get(progress_r);
		if (!prog_before.ok) return;
		h.res.set(progress_r, { ...prog_before.value, dirty_stats: true });

		h.schedule.add("update", make_stats_recompute_system(), { name: "stats" });
		tick();

		const stats = h.world.get(player_id!, stats_c);
		const prog = h.res.get(progress_r);
		if (!stats.ok || !prog.ok) return;
		expect(stats.value.atk).toBe(8);
		expect(prog.value.dirty_stats).toBe(false);
	});

	test("dirty_stats=false → stats untouched", () => {
		const { h, player_id, tick } = make_progress_scenario({ with_player: true });
		h.world.set(player_id!, perks_c, { applied: ["perk.atk_plus"] });
		h.schedule.add("update", make_stats_recompute_system(), { name: "stats" });
		tick();
		const stats = h.world.get(player_id!, stats_c);
		if (!stats.ok) return;
		expect(stats.value).toEqual(BASE_STATS);
	});
});
