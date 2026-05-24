import { describe, expect, test } from "bun:test";
import type { Id } from "@f0rbit/forge";
import { rng as make_rng } from "@f0rbit/forge";
import {
	advance_particles,
	emit_burst,
	make_particles_emit_system,
} from "../src/systems/particles.ts";
import { hit_events_r, particles_r, type Particles } from "../src/resources.ts";
import { make_progress_scenario } from "./fixtures/progress-scenario.ts";

// Mirrors arena/test/particles.test.ts — the ring-buffer + emit + advance
// shape is identical (constants tuned for cell-step in particles.ts;
// pure data API is unchanged).

const make_particles = (capacity: number): Particles => ({
	entries: Array.from({ length: capacity }, () => ({
		x: 0, y: 0, vx: 0, vy: 0, ttl: 0, max_ttl: 0, color: 0, size: 0,
	})),
	head: 0,
	capacity,
});

const alive = (p: Particles): number => p.entries.filter((e) => e.ttl > 0).length;

describe("progress particles ring buffer", () => {
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
});

describe("progress particles per-kind routing", () => {
	const setup = () => {
		const scenario = make_progress_scenario({ with_player: true });
		const h = scenario.h;
		h.schedule.add("update", make_particles_emit_system(), { phase: 99, name: "p.emit" });
		return { h, player_id: scenario.player_id! };
	};

	const push = (
		h: ReturnType<typeof setup>["h"],
		kind: "swing" | "kill" | "damage",
		target_id: Id,
	): void => {
		const r = h.ctx.res.get(hit_events_r);
		if (!r.ok) throw new Error("hit_events_r missing");
		r.value.events.push({ kind, target_id, x: 100, y: 100, damage: kind === "swing" ? 0 : 1 });
	};

	const alive_in_res = (h: ReturnType<typeof setup>["h"]): number => {
		const p = h.ctx.res.get(particles_r);
		if (!p.ok) return 0;
		return p.value.entries.filter((e) => e.ttl > 0).length;
	};

	const tick = (h: ReturnType<typeof setup>["h"]): void => {
		h.time.advance(1 / 60);
		h.schedule.tick(h.world, h.ctx);
	};

	test("swing event emits NO particles", () => {
		const { h, player_id } = setup();
		push(h, "swing", player_id);
		tick(h);
		expect(alive_in_res(h)).toBe(0);
	});

	test("kill event emits 16 particles", () => {
		const { h, player_id } = setup();
		push(h, "kill", player_id);
		tick(h);
		expect(alive_in_res(h)).toBe(16);
	});

	test("damage event emits 8 particles", () => {
		const { h, player_id } = setup();
		push(h, "damage", player_id);
		tick(h);
		expect(alive_in_res(h)).toBe(8);
	});

	test("kill particles are yellow (0xffaa44); damage are red (0xff4040)", () => {
		const { h, player_id } = setup();
		push(h, "kill", player_id);
		tick(h);
		const p = h.ctx.res.get(particles_r);
		expect(p.ok).toBe(true);
		if (!p.ok) return;
		const kill_colors = new Set(p.value.entries.filter((e) => e.ttl > 0).map((e) => e.color));
		expect(kill_colors.has(0xffaa44)).toBe(true);

		// Fresh sim for damage so we don't mix bursts.
		const { h: h2, player_id: pid2 } = setup();
		push(h2, "damage", pid2);
		tick(h2);
		const p2 = h2.ctx.res.get(particles_r);
		expect(p2.ok).toBe(true);
		if (!p2.ok) return;
		const damage_colors = new Set(p2.value.entries.filter((e) => e.ttl > 0).map((e) => e.color));
		expect(damage_colors.has(0xff4040)).toBe(true);
	});
});
