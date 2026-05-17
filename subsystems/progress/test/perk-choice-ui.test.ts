import { describe, expect, test } from "bun:test";
import { button_at, button_rects } from "../src/systems/perk-choice-ui.ts";

// Pure hit-test math — no Pixi, no boot. Mirrors loot/test/inventory-ui.test.ts:
// lock the design-coord layout in place so regressions are caught at the unit
// level. The full UI redraw is exercised at the browser / debug-fixture level.

describe("progress perk-choice-ui — button_rects layout", () => {
	test("has 3 entries", () => {
		expect(button_rects.length).toBe(3);
	});

	test("all buttons share the same y and h (single horizontal row)", () => {
		const r0 = button_rects[0]!;
		for (const r of button_rects) {
			expect(r.y).toBe(r0.y);
			expect(r.h).toBe(r0.h);
		}
	});

	test("all buttons are 80×40", () => {
		for (const r of button_rects) {
			expect(r.w).toBe(80);
			expect(r.h).toBe(40);
		}
	});

	test("buttons are equally-spaced left-to-right", () => {
		const r0 = button_rects[0]!;
		const r1 = button_rects[1]!;
		const r2 = button_rects[2]!;
		const gap_01 = r1.x - (r0.x + r0.w);
		const gap_12 = r2.x - (r1.x + r1.w);
		expect(gap_01).toBe(gap_12);
		expect(gap_01).toBe(8);
	});
});

describe("progress perk-choice-ui — button_at", () => {
	test("click in button 0 center returns 0", () => {
		const r = button_rects[0]!;
		expect(button_at(r.x + r.w / 2, r.y + r.h / 2)).toBe(0);
	});

	test("click in button 1 center returns 1", () => {
		const r = button_rects[1]!;
		expect(button_at(r.x + r.w / 2, r.y + r.h / 2)).toBe(1);
	});

	test("click in button 2 center returns 2", () => {
		const r = button_rects[2]!;
		expect(button_at(r.x + r.w / 2, r.y + r.h / 2)).toBe(2);
	});

	test("click on button 0's top-left corner (inclusive edge) returns 0", () => {
		const r = button_rects[0]!;
		expect(button_at(r.x, r.y)).toBe(0);
	});

	test("click on button 2's bottom-right corner (inclusive edge) returns 2", () => {
		const r = button_rects[2]!;
		expect(button_at(r.x + r.w, r.y + r.h)).toBe(2);
	});

	test("click 1px above button 0 returns null", () => {
		const r = button_rects[0]!;
		expect(button_at(r.x + r.w / 2, r.y - 1)).toBeNull();
	});

	test("click in the gap between button 0 and button 1 returns null", () => {
		const r0 = button_rects[0]!;
		const r1 = button_rects[1]!;
		const gap_x = (r0.x + r0.w + r1.x) / 2;
		expect(button_at(gap_x, r0.y + r0.h / 2)).toBeNull();
	});

	test("click far outside the design canvas (negative coords) returns null", () => {
		expect(button_at(-5, -5)).toBeNull();
	});

	test("click far outside the design canvas (huge coords) returns null", () => {
		expect(button_at(10000, 10000)).toBeNull();
	});
});
