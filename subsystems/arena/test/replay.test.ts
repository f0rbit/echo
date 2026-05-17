import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { harness, pos_c, replay } from "@f0rbit/forge";
import type { Ctx, ReplayDoc, World } from "@f0rbit/forge";
import { replay_schema } from "@f0rbit/forge";
import { game_bindings } from "../src/bindings.ts";
import { chaser_c, health_c, player_c } from "../src/components.ts";
import { particles_r, wave_r } from "../src/resources.ts";
import { game_plugin } from "../src/plugin.ts";

const replay_path = new URL("../replays/wave-clear.replay.json", import.meta.url).pathname;
const replay_json = readFileSync(replay_path, "utf8");
const expected_hash = "b875c1d14577f46c8e2b1ea686c44ff8e717948ffe8857b1089b7dc9b7bf0e87";
const REPLAY_TIMEOUT_MS = 30000;

type Sim = { ctx: Ctx; w: World; tick: () => void; doc: ReplayDoc };

const make_sim = (doc: ReplayDoc): Sim => {
	const h = harness({ seed: doc.seed, fixed_dt: doc.fixed_dt, bindings: game_bindings });
	game_plugin(h.world, h.schedule);
	replay.play(doc, h.input, () => h.time.tick);
	// Initial startup tick (matches the recorder — see tools/record-wave-clear.ts).
	h.time.advance(doc.fixed_dt);
	h.schedule.tick(h.world, h.ctx);
	return {
		ctx: h.ctx,
		w: h.world,
		doc,
		tick: () => {
			h.time.advance(doc.fixed_dt);
			h.schedule.tick(h.world, h.ctx);
		},
	};
};

const player_pos = (sim: Sim): { x: number; y: number } | null => {
	for (const [, p] of sim.w.query([player_c, pos_c] as const).collect()) return { x: p.x, y: p.y };
	return null;
};

const player_health_value = (sim: Sim): number => {
	for (const [, hc] of sim.w.query([player_c, health_c] as const).collect()) return hc.current;
	return -1;
};

const wave_state = (sim: Sim): { current: number; total: number; chasers_alive: number; total_kills: number } => {
	const r = sim.ctx.res.get(wave_r);
	if (!r.ok) throw new Error("wave_r missing");
	return r.value;
};

const particles_alive_count = (sim: Sim): number => {
	const r = sim.ctx.res.get(particles_r);
	if (!r.ok) return 0;
	return r.value.entries.filter(e => e.ttl > 0).length;
};

const world_hash = (sim: Sim): string => {
	const pp = player_pos(sim);
	const w = wave_state(sim);
	const snap = {
		// Round positions to 1e-6 to be safe against any IEEE-754 reorder
		// drift; production code keeps positions deterministic via fixed-dt
		// integration, but rounding makes the hash robust to forge minor bumps.
		player: pp ? { x: Math.round(pp.x * 1e6) / 1e6, y: Math.round(pp.y * 1e6) / 1e6 } : null,
		chasers_alive: w.chasers_alive,
		wave: { current: w.current, total: w.total, total_kills: w.total_kills },
		health: player_health_value(sim),
		particles_alive: particles_alive_count(sim),
	};
	return createHash("sha256").update(JSON.stringify(snap)).digest("hex");
};

const advance_to_end = (sim: Sim): void => {
	const ctx = sim.ctx as Ctx & { time: { tick: number } };
	const last_event_tick = sim.doc.frames[sim.doc.frames.length - 1]?.tick ?? 0;
	// Run a tick past the last recorded event so any final fire transitions
	// land (the recorder closes with a neutral-state tick).
	const target = last_event_tick + 1;
	while (ctx.time.tick < target) sim.tick();
};

describe("arena replay deliverable", () => {
	test("replay JSON loads and validates against replay_schema", () => {
		const r = replay.load(replay_json);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const parsed = replay_schema.safeParse(JSON.parse(replay_json));
		expect(parsed.success).toBe(true);
		expect(r.value.seed).toBe(1);
		expect(r.value.fixed_dt).toBeCloseTo(1 / 60);
		expect(r.value.frames.length).toBeGreaterThan(0);
	}, REPLAY_TIMEOUT_MS);

	test("particles emitted on every kill tick — particles_r has at least one ttl>0 entry", () => {
		const r = replay.load(replay_json);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const sim = make_sim(r.value);
		const last_event_tick = r.value.frames[r.value.frames.length - 1]?.tick ?? 0;
		const target = last_event_tick + 1;

		let prev_kills = wave_state(sim).total_kills;
		const ctx = sim.ctx as Ctx & { time: { tick: number } };
		while (ctx.time.tick < target) {
			sim.tick();
			const kills = wave_state(sim).total_kills;
			if (kills > prev_kills) {
				expect(particles_alive_count(sim)).toBeGreaterThan(0);
				prev_kills = kills;
			}
		}
		expect(prev_kills).toBeGreaterThanOrEqual(15);
	}, REPLAY_TIMEOUT_MS);

	test("wave_r.total_kills === 15 after replay completes", () => {
		const r = replay.load(replay_json);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const sim = make_sim(r.value);
		advance_to_end(sim);
		expect(wave_state(sim).total_kills).toBe(15);
	}, REPLAY_TIMEOUT_MS);

	test("player health_c.current > 0 after replay completes", () => {
		const r = replay.load(replay_json);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const sim = make_sim(r.value);
		advance_to_end(sim);
		expect(player_health_value(sim)).toBeGreaterThan(0);
	}, REPLAY_TIMEOUT_MS);

	test("wave_r.current === 3 and chasers_alive === 0 after replay completes (win signal)", () => {
		const r = replay.load(replay_json);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const sim = make_sim(r.value);
		advance_to_end(sim);
		const w = wave_state(sim);
		expect(w.current).toBe(3);
		expect(w.chasers_alive).toBe(0);
		// No live chasers remain in the world either.
		expect(sim.w.query([chaser_c] as const).collect().length).toBe(0);
	}, REPLAY_TIMEOUT_MS);

	test("world hash at end of replay matches expected snapshot", () => {
		const r = replay.load(replay_json);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const sim = make_sim(r.value);
		advance_to_end(sim);
		expect(world_hash(sim)).toBe(expected_hash);
	}, REPLAY_TIMEOUT_MS);

	test("two consecutive replay runs produce byte-identical world hashes", () => {
		const r1 = replay.load(replay_json);
		const r2 = replay.load(replay_json);
		expect(r1.ok).toBe(true);
		expect(r2.ok).toBe(true);
		if (!r1.ok || !r2.ok) return;
		const sim_a = make_sim(r1.value);
		const sim_b = make_sim(r2.value);
		advance_to_end(sim_a);
		advance_to_end(sim_b);
		expect(world_hash(sim_a)).toBe(world_hash(sim_b));
	}, REPLAY_TIMEOUT_MS * 2);
});
