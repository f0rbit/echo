import { describe, expect, test } from "bun:test";
import { rng as make_rng } from "@f0rbit/forge";
import { advance_particles, emit_burst } from "../src/systems/particles.ts";
import type { Particles } from "../src/resources.ts";

const make_particles = (capacity: number): Particles => ({
	entries: Array.from({ length: capacity }, () => ({
		x: 0,
		y: 0,
		vx: 0,
		vy: 0,
		ttl: 0,
		max_ttl: 0,
		color: 0,
		size: 0,
	})),
	head: 0,
	capacity,
});

const alive = (p: Particles): number => p.entries.filter((e) => e.ttl > 0).length;

describe("particles ring buffer", () => {
	test("emit writes `count` entries and advances head", () => {
		const p = make_particles(16);
		const rng = make_rng(1);
		emit_burst(p, 10, 20, 5, () => rng.next());
		expect(p.head).toBe(5);
		expect(alive(p)).toBe(5);
		const first = p.entries[0]!;
		expect(first.x).toBe(10);
		expect(first.y).toBe(20);
		expect(first.ttl).toBeGreaterThan(0);
		expect(first.max_ttl).toBe(first.ttl);
	});

	test("emit wraps when head exceeds capacity", () => {
		const p = make_particles(8);
		const rng = make_rng(2);
		emit_burst(p, 0, 0, 6, () => rng.next());
		emit_burst(p, 0, 0, 6, () => rng.next());
		expect(p.head).toBe((6 + 6) % 8);
		expect(alive(p)).toBe(8);
	});

	test("advance decrements ttl and integrates by velocity", () => {
		const p = make_particles(4);
		p.entries[0] = { x: 0, y: 0, vx: 10, vy: -5, ttl: 3, max_ttl: 3, color: 0, size: 1 };
		p.entries[1] = { x: 100, y: 100, vx: 0, vy: 0, ttl: 1, max_ttl: 1, color: 0, size: 1 };
		advance_particles(p, 1);
		expect(p.entries[0]!.x).toBe(10);
		expect(p.entries[0]!.y).toBe(-5);
		expect(p.entries[0]!.ttl).toBe(2);
		expect(p.entries[1]!.ttl).toBe(0);
	});

	test("advance skips entries with ttl <= 0", () => {
		const p = make_particles(2);
		p.entries[0] = { x: 5, y: 5, vx: 999, vy: 999, ttl: 0, max_ttl: 0, color: 0, size: 1 };
		advance_particles(p, 1);
		expect(p.entries[0]!.x).toBe(5);
		expect(p.entries[0]!.y).toBe(5);
		expect(p.entries[0]!.ttl).toBe(0);
	});

	test("emit is deterministic given a seeded rng", () => {
		const a = make_particles(32);
		const b = make_particles(32);
		const r1 = make_rng(42);
		const r2 = make_rng(42);
		emit_burst(a, 50, 50, 12, () => r1.next());
		emit_burst(b, 50, 50, 12, () => r2.next());
		for (let i = 0; i < 12; i++) {
			expect(a.entries[i]!.vx).toBe(b.entries[i]!.vx);
			expect(a.entries[i]!.vy).toBe(b.entries[i]!.vy);
		}
	});

	test("emit beyond capacity preserves the most recent capacity entries", () => {
		const p = make_particles(4);
		const rng = make_rng(7);
		emit_burst(p, 1, 1, 4, () => rng.next());
		const first_x = p.entries[0]!.x;
		expect(first_x).toBe(1);
		emit_burst(p, 9, 9, 4, () => rng.next());
		expect(p.head).toBe(0);
		expect(alive(p)).toBe(4);
		for (const e of p.entries) expect(e.x).toBe(9);
	});
});
