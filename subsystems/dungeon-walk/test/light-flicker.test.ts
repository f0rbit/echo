import { describe, expect, test } from "bun:test";
import {
	candle_flicker,
	fluorescent_flicker,
	sine_flicker,
	torch_flicker,
} from "../src/systems/light/flicker.ts";

describe("flicker is deterministic", () => {
	test("torch_flicker is pure given (seed, t, amount)", () => {
		const a = torch_flicker(42, 1.234, 0.15);
		const b = torch_flicker(42, 1.234, 0.15);
		expect(a.intensity).toBe(b.intensity);
		expect(a.radius).toBe(b.radius);
	});

	test("torch_flicker intensity stays in roughly [0.7, 1.3]", () => {
		for (let i = 0; i < 200; i++) {
			const { intensity } = torch_flicker(7, i * 0.01, 0.15);
			expect(intensity).toBeGreaterThan(0.7);
			expect(intensity).toBeLessThan(1.3);
		}
	});

	test("torch_flicker varies with t", () => {
		const a = torch_flicker(1, 0, 0.15);
		const b = torch_flicker(1, 1, 0.15);
		expect(a.intensity).not.toBe(b.intensity);
	});

	test("torch_flicker varies with seed", () => {
		const a = torch_flicker(1, 0.5, 0.15);
		const b = torch_flicker(2, 0.5, 0.15);
		expect(a.intensity).not.toBe(b.intensity);
	});

	test("candle_flicker is pure given (seed, t, amount)", () => {
		const a = candle_flicker(3, 2.5, 0.15);
		const b = candle_flicker(3, 2.5, 0.15);
		expect(a.intensity).toBe(b.intensity);
		expect(a.radius).toBe(b.radius);
	});

	test("fluorescent_flicker steps at 10 Hz", () => {
		const a = fluorescent_flicker(0, 0.05);
		const b = fluorescent_flicker(0, 0.099);
		const c = fluorescent_flicker(0, 0.101);
		expect(a).toBe(b);
		expect(a).not.toBe(c);
	});

	test("sine_flicker matches closed form", () => {
		const v = sine_flicker(2, 0.1, 0.125);
		expect(v).toBeCloseTo(1 + Math.sin(0.125 * 2 * Math.PI * 2) * 0.1, 10);
	});
});
