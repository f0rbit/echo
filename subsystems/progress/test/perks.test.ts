import { describe, expect, test } from "bun:test";
import { make_perk_registry, PERKS, xp_threshold, type PerkId } from "../src/data/perks.ts";
import { perk_def_schema } from "../src/data/schemas.ts";
import { make_progress_scenario } from "./fixtures/progress-scenario.ts";
import { make_perks_system } from "../src/systems/perks.ts";
import { hp_c, perks_c } from "../src/components.ts";
import { level_up_pending_r, progress_r } from "../src/resources.ts";

describe("progress perks registry", () => {
	test("every PerkDef validates against perk_def_schema", () => {
		for (const def of PERKS) {
			const parsed = perk_def_schema.safeParse(def);
			expect(parsed.success).toBe(true);
		}
	});

	test("make_perk_registry produces 5 entries with id == map key", () => {
		const reg = make_perk_registry();
		expect(reg.perks.size).toBe(5);
		for (const [key, value] of reg.perks) {
			expect(value.id).toBe(key);
		}
	});

	test("perk ids are unique across PERKS", () => {
		const ids = PERKS.map((d) => d.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	test("all 5 shipped perks are present with expected modifiers", () => {
		const by_id = new Map(PERKS.map((d) => [d.id as string, d]));
		expect(by_id.get("perk.atk_plus")?.modifier).toEqual({ atk: 3 });
		expect(by_id.get("perk.def_plus")?.modifier).toEqual({ def: 2 });
		expect(by_id.get("perk.spd_plus")?.modifier).toEqual({ spd_mul: 0.15 });
		expect(by_id.get("perk.hp_plus")?.modifier).toEqual({ hp: 5 });
		expect(by_id.get("perk.xp_gain")?.modifier).toEqual({ xp_gain_mul: 0.25 });
	});
});

describe("progress xp_threshold curve", () => {
	test("level 0 (and below) returns 0", () => {
		expect(xp_threshold(0)).toBe(0);
		expect(xp_threshold(-1)).toBe(0);
	});

	test("matches plan §2 Q5 anchors: 1→2 = 100, 2→3 = 200, 3→4 = 300", () => {
		expect(xp_threshold(1)).toBe(100);
		expect(xp_threshold(2)).toBe(200);
		expect(xp_threshold(3)).toBe(300);
	});

	test("strictly monotonic increasing for levels 1..10", () => {
		for (let n = 1; n <= 10; n++) {
			expect(xp_threshold(n + 1)).toBeGreaterThan(xp_threshold(n));
		}
	});

	test("positive for every level >= 1", () => {
		for (let n = 1; n <= 10; n++) {
			expect(xp_threshold(n)).toBeGreaterThan(0);
		}
	});
});

describe("progress PerkId branding", () => {
	test("PerkId values round-trip through the Map cleanly", () => {
		const reg = make_perk_registry();
		const some_id: PerkId = PERKS[0]!.id;
		expect(reg.perks.get(some_id)?.id).toBe(some_id);
	});
});

const seed_pending = (
	h: ReturnType<typeof make_progress_scenario>["h"],
	choices: readonly string[],
): void => {
	const prog = h.res.get(progress_r);
	if (!prog.ok) return;
	h.res.set(progress_r, { ...prog.value, paused: true });
	h.res.set(level_up_pending_r, { pending: true, choices });
};

describe("make_perks_system — pick consumption", () => {
	test("queue_perk_pick(0) while paused/pending → perk appended, paused cleared, dirty_stats set", () => {
		const { h, player_id, tick } = make_progress_scenario({ with_player: true });
		seed_pending(h, ["perk.atk_plus", "perk.def_plus", "perk.spd_plus"]);
		const perks_sys = make_perks_system();
		h.schedule.add("update", perks_sys.system, { name: "perks" });

		perks_sys.queue_perk_pick(0);
		tick();

		const perks = h.world.get(player_id!, perks_c);
		const prog = h.res.get(progress_r);
		const lvl = h.res.get(level_up_pending_r);
		if (!perks.ok || !prog.ok || !lvl.ok) return;
		expect(perks.value.applied).toEqual(["perk.atk_plus"]);
		expect(prog.value.paused).toBe(false);
		expect(prog.value.dirty_stats).toBe(true);
		expect(lvl.value.pending).toBe(false);
		expect(lvl.value.choices).toEqual([]);
	});

	test("queue_perk_pick while NOT paused → no state change", () => {
		const { h, player_id, tick } = make_progress_scenario({ with_player: true });
		const perks_sys = make_perks_system();
		h.schedule.add("update", perks_sys.system, { name: "perks" });

		perks_sys.queue_perk_pick(0);
		tick();

		const perks = h.world.get(player_id!, perks_c);
		const prog = h.res.get(progress_r);
		if (!perks.ok || !prog.ok) return;
		expect(perks.value.applied).toEqual([]);
		expect(prog.value.paused).toBe(false);
		expect(prog.value.dirty_stats).toBe(false);
	});

	test("perk.hp_plus pick also bumps hp_c.current by 5 (heal-on-pick hook)", () => {
		const { h, player_id, tick } = make_progress_scenario({ with_player: true });
		h.world.set(player_id!, hp_c, { current: 7, max: 10 });
		seed_pending(h, ["perk.hp_plus", "perk.atk_plus", "perk.def_plus"]);
		const perks_sys = make_perks_system();
		h.schedule.add("update", perks_sys.system, { name: "perks" });

		perks_sys.queue_perk_pick(0);
		tick();

		const hp = h.world.get(player_id!, hp_c);
		const perks = h.world.get(player_id!, perks_c);
		if (!hp.ok || !perks.ok) return;
		expect(hp.value.current).toBe(12);
		expect(perks.value.applied).toEqual(["perk.hp_plus"]);
	});

	test("stacking: same perk picked twice appears twice in perks_c.applied", () => {
		const { h, player_id, tick } = make_progress_scenario({ with_player: true });
		seed_pending(h, ["perk.atk_plus", "perk.def_plus", "perk.spd_plus"]);
		const perks_sys = make_perks_system();
		h.schedule.add("update", perks_sys.system, { name: "perks" });

		perks_sys.queue_perk_pick(0);
		tick();

		// Re-arm pending and pick the same perk id again.
		seed_pending(h, ["perk.atk_plus", "perk.def_plus", "perk.spd_plus"]);
		perks_sys.queue_perk_pick(0);
		tick();

		const perks = h.world.get(player_id!, perks_c);
		if (!perks.ok) return;
		expect(perks.value.applied).toEqual(["perk.atk_plus", "perk.atk_plus"]);
	});
});
