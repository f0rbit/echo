import { describe, expect, test } from "bun:test";
import { ITEMS, make_item_registry } from "../src/data/items.ts";
import { item_def_schema } from "../src/data/schemas.ts";

describe("loot items registry", () => {
	test("every ItemDef validates against item_def_schema", () => {
		for (const def of ITEMS) {
			const parsed = item_def_schema.safeParse(def);
			expect(parsed.success).toBe(true);
		}
	});

	test("make_item_registry produces 12 entries with id == map key", () => {
		const reg = make_item_registry();
		expect(reg.items.size).toBe(12);
		for (const [key, value] of reg.items) {
			expect(value.id).toBe(key);
		}
	});

	test("item ids are unique across ITEMS", () => {
		const ids = ITEMS.map((d) => d.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	test("each kind has the expected count and items are tagged correctly", () => {
		const by_kind = ITEMS.reduce<Record<string, number>>((acc, d) => {
			acc[d.kind] = (acc[d.kind] ?? 0) + 1;
			return acc;
		}, {});
		expect(by_kind.weapon).toBe(3);
		expect(by_kind.offhand).toBe(2);
		expect(by_kind.ring).toBe(4);
		expect(by_kind.potion).toBe(3);
		for (const d of ITEMS) {
			expect(["weapon", "offhand", "ring", "potion"]).toContain(d.kind);
		}
	});
});
