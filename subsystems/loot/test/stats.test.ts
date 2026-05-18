import { describe, expect, test } from "bun:test";
import { make_loot_scenario, make_test_registry } from "./fixtures/loot-scenario.ts";
import { BASE_STATS, compute_stats, make_stats_recompute_system } from "../src/systems/stats.ts";
import { equipment_c, stats_c, type Equipment } from "../src/components.ts";
import { inventory_ui_r } from "../src/resources.ts";

const SWORD = "item.sword_of_fire"; // atk +3
const SHIELD = "item.staff_warding"; // def +2
const RING_HASTE = "item.ring_of_haste"; // spd_mul +0.10
const RING_POWER = "item.ring_of_power"; // atk +1
// Synthetic registry for stacking math (so the test pins exact numerics
// independent of the canonical ring catalogue).

const empty_eq: Equipment = { weapon: null, offhand: null, ring1: null, ring2: null };

describe("compute_stats — composition", () => {
	test("no equipment returns base", () => {
		const reg = make_test_registry();
		expect(compute_stats(BASE_STATS, empty_eq, reg)).toEqual(BASE_STATS);
	});

	test("weapon adds atk (sword_of_fire +3)", () => {
		const reg = make_test_registry();
		const eq: Equipment = { ...empty_eq, weapon: SWORD };
		expect(compute_stats(BASE_STATS, eq, reg)).toEqual({ atk: 8, def: 2, spd: 1.0, hp: 10 });
	});

	test("ring of haste applies multiplicative spd (+10%)", () => {
		const reg = make_test_registry();
		const eq: Equipment = { ...empty_eq, ring1: RING_HASTE };
		const out = compute_stats(BASE_STATS, eq, reg);
		expect(out.spd).toBeCloseTo(1.1, 10);
		expect(out.atk).toBe(5);
	});

	test("two rings stack multiplicatively (haste 10% × custom 15% = 1.265)", () => {
		// build a synthetic registry with two known spd_mul rings
		const items = new Map(make_test_registry().items);
		items.set("item.ring_of_haste" as any, {
			id: "item.ring_of_haste" as any,
			name: "Ring of Haste",
			kind: "ring",
			modifier: { spd_mul: 0.1 },
			color: 0,
			frame: "flask_big_blue",
		});
		items.set("item.ring_of_test_15" as any, {
			id: "item.ring_of_test_15" as any,
			name: "Test +15%",
			kind: "ring",
			modifier: { spd_mul: 0.15 },
			color: 0,
			frame: "flask_big_blue",
		});
		const reg = { items };
		const eq: Equipment = { ...empty_eq, ring1: "item.ring_of_haste", ring2: "item.ring_of_test_15" };
		const out = compute_stats(BASE_STATS, eq, reg);
		expect(out.spd).toBeCloseTo(1.265, 10);
	});

	test("mixed equipment: sword + shield + ring_of_power → atk 9, def 4, spd 1.0", () => {
		const reg = make_test_registry();
		const eq: Equipment = {
			weapon: SWORD,
			offhand: SHIELD,
			ring1: RING_POWER,
			ring2: null,
		};
		const out = compute_stats(BASE_STATS, eq, reg);
		expect(out).toEqual({ atk: 9, def: 4, spd: 1.0, hp: 10 });
	});

	test("negative modifier clamps to ≥ 0", () => {
		const items = new Map(make_test_registry().items);
		items.set("item.cursed" as any, {
			id: "item.cursed" as any,
			name: "Cursed Trinket",
			kind: "ring",
			modifier: { atk: -999 },
			color: 0,
			frame: "flask_big_red",
		});
		const reg = { items };
		const eq: Equipment = { ...empty_eq, ring1: "item.cursed" };
		const out = compute_stats(BASE_STATS, eq, reg);
		expect(out.atk).toBe(0);
	});
});

describe("stats_recompute_system", () => {
	test("dirty_stats=true triggers recompute and clears the flag", () => {
		const { h, player_id, tick } = make_loot_scenario({
			with_player: true,
			equipment: { weapon: SWORD },
		});
		h.res.set(inventory_ui_r, { open: false, selected_slot: null, dirty_stats: true });
		h.schedule.add("update", make_stats_recompute_system(), { name: "stats" });
		tick();
		const stats = h.world.get(player_id!, stats_c);
		const ui = h.res.get(inventory_ui_r);
		if (!stats.ok || !ui.ok) return;
		expect(stats.value.atk).toBe(8);
		expect(ui.value.dirty_stats).toBe(false);
	});

	test("no dirty flag → stats unchanged", () => {
		const { h, player_id, tick } = make_loot_scenario({
			with_player: true,
			equipment: { weapon: SWORD },
		});
		// dirty_stats is false from the fixture default
		h.schedule.add("update", make_stats_recompute_system(), { name: "stats" });
		tick();
		const stats = h.world.get(player_id!, stats_c);
		if (!stats.ok) return;
		expect(stats.value).toEqual({ atk: 5, def: 2, spd: 1.0, hp: 10 });
	});

	test("recompute reads current equipment_c snapshot, not stats_c", () => {
		// Verifies the recompute fn starts from BASE, not from the
		// already-computed stats_c — otherwise multiple ticks would compound.
		const { h, player_id, tick } = make_loot_scenario({
			with_player: true,
			equipment: { weapon: SWORD },
		});
		h.schedule.add("update", make_stats_recompute_system(), { name: "stats" });
		h.res.set(inventory_ui_r, { open: false, selected_slot: null, dirty_stats: true });
		tick();
		h.res.set(inventory_ui_r, { open: false, selected_slot: null, dirty_stats: true });
		tick();
		const stats = h.world.get(player_id!, stats_c);
		if (!stats.ok) return;
		expect(stats.value.atk).toBe(8); // not 11, not 5

		// And if we unequip and re-tick, stats should drop back to base.
		h.world.set(player_id!, equipment_c, { weapon: null, offhand: null, ring1: null, ring2: null });
		h.res.set(inventory_ui_r, { open: false, selected_slot: null, dirty_stats: true });
		tick();
		const s2 = h.world.get(player_id!, stats_c);
		if (!s2.ok) return;
		expect(s2.value).toEqual({ atk: 5, def: 2, spd: 1.0, hp: 10 });
	});
});
