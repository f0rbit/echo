import { describe, expect, test } from "bun:test";
import { make_perk_registry, PERKS, xp_threshold, type PerkId } from "../src/data/perks.ts";
import { perk_def_schema } from "../src/data/schemas.ts";

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
