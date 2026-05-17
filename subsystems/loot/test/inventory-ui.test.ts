import { describe, expect, test } from "bun:test";
import { slot_at, slot_rects } from "../src/systems/inventory-ui.ts";

// Pure hit-test math — no Pixi, no boot. Mirrors arena's
// test/wall-autotile.test.ts: lock the design-coord layout in place so
// regressions are caught at the unit level.

describe("loot inventory-ui — slot_rects layout", () => {
	test("has 12 entries (4 cols × 3 rows)", () => {
		expect(slot_rects.length).toBe(12);
	});

	test("slot rows are equally-spaced and aligned", () => {
		const r0 = slot_rects[0]!;
		const r4 = slot_rects[4]!;
		const r8 = slot_rects[8]!;
		expect(r0.x).toBe(r4.x);
		expect(r4.x).toBe(r8.x);
		expect(r4.y - r0.y).toBe(r8.y - r4.y);
	});

	test("slot columns are equally-spaced and aligned", () => {
		const r0 = slot_rects[0]!;
		const r1 = slot_rects[1]!;
		const r2 = slot_rects[2]!;
		const r3 = slot_rects[3]!;
		expect(r0.y).toBe(r1.y);
		expect(r1.y).toBe(r2.y);
		expect(r2.y).toBe(r3.y);
		expect(r1.x - r0.x).toBe(r2.x - r1.x);
		expect(r2.x - r1.x).toBe(r3.x - r2.x);
	});

	test("all slots are 24×24", () => {
		for (const r of slot_rects) {
			expect(r.w).toBe(24);
			expect(r.h).toBe(24);
		}
	});
});

describe("loot inventory-ui — slot_at", () => {
	test("click in slot 0 center returns 0", () => {
		const r = slot_rects[0]!;
		expect(slot_at(r.x + r.w / 2, r.y + r.h / 2)).toBe(0);
	});

	test("click in slot 11 center returns 11", () => {
		const r = slot_rects[11]!;
		expect(slot_at(r.x + r.w / 2, r.y + r.h / 2)).toBe(11);
	});

	test("click in slot 5 (middle row, second col) center returns 5", () => {
		const r = slot_rects[5]!;
		expect(slot_at(r.x + r.w / 2, r.y + r.h / 2)).toBe(5);
	});

	test("click on slot 0's top-left corner (inclusive edge) returns 0", () => {
		const r = slot_rects[0]!;
		expect(slot_at(r.x, r.y)).toBe(0);
	});

	test("click on slot 0's bottom-right corner (inclusive edge) returns 0", () => {
		const r = slot_rects[0]!;
		expect(slot_at(r.x + r.w, r.y + r.h)).toBe(0);
	});

	test("click 1px outside slot 0 (above) returns null", () => {
		const r = slot_rects[0]!;
		expect(slot_at(r.x + r.w / 2, r.y - 1)).toBeNull();
	});

	test("click in the gap between slot 0 and slot 1 returns null", () => {
		const r0 = slot_rects[0]!;
		const r1 = slot_rects[1]!;
		const gap_x = (r0.x + r0.w + r1.x) / 2;
		expect(slot_at(gap_x, r0.y + r0.h / 2)).toBeNull();
	});

	test("click far outside the grid (negative coords) returns null", () => {
		expect(slot_at(-5, -5)).toBeNull();
	});

	test("click far outside the grid (huge coords) returns null", () => {
		expect(slot_at(10000, 10000)).toBeNull();
	});
});
