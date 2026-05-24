import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
	harness,
	pos_c,
	replay,
	replay_schema,
	snapshot_schema,
	type Ctx,
	type ReplayDoc,
	type World,
} from "@f0rbit/forge";
import { game_bindings } from "../src/bindings.ts";
import {
	chaser_c,
	hp_c,
	perks_c,
	player_c,
	stats_c,
	visual_pos_c,
	xp_c,
} from "../src/components.ts";
import { g } from "../src/grid.ts";
import { game_plugin } from "../src/plugin.ts";
import { level_up_pending_r, progress_r, swing_state_r } from "../src/resources.ts";
import { make_progress_snapshotter } from "../src/snapshot.ts";

const REPLAY_TIMEOUT_MS = 30000;
const replay_path = new URL("../replays/level-and-save.replay.json", import.meta.url).pathname;
const replay_json = readFileSync(replay_path, "utf8");

// Baked end-state values (recorded by tools/record-level-and-save.ts on
// seed=1). With the swing-window melee fix (Phase 5.4.bugfix3 —
// edge-triggered melee replaced by `SWING_WINDOW_TICKS`-frame window
// because contact-damage would always despawn the chaser on the same
// tick a Z press would land), the recorder reliably outpaces multi-
// chaser flank damage: all 3 picks land, player survives.
const EXPECTED_FINAL_PERKS: readonly string[] = ["perk.atk_plus", "perk.hp_plus", "perk.def_plus"];
// BASE stats { atk: 5, def: 2, spd: 1, max_hp: 10, xp_gain_mul: 0 } plus
// perk.atk_plus (+3 atk) + perk.hp_plus (+5 hp) + perk.def_plus (+2 def):
//   atk = 5 + 3 = 8
//   def = 2 + 2 = 4
//   max_hp = 10 + 5 = 15
const EXPECTED_FINAL_STATS = { atk: 8, def: 4, spd: 1, max_hp: 15, xp_gain_mul: 0 } as const;
const EXPECTED_FINAL_LEVEL = 4;
// Recorder reaches level 4 + 3 picks at tick 1512, then settles 30 ticks.
const EXPECTED_END_TICK = 1542;
// Tick after the first level-up pick (consumed on the tick after the
// last press edge before pause).
const TICK_AFTER_FIRST_PICK = 411;
// Snap tick chosen during the post-pick settle window so any spawn-RNG
// fork-draws have stabilised. enemy-spawn.ts re-forks per tick (label
// `progress.spawn.${tick}`) so the parallel-world continuation stays
// byte-stable across restore — no closure-held fork to drift.
const MID_REPLAY_SNAP_TICK = 1520;

type Sim = { ctx: Ctx; w: World; tick: () => void; doc: ReplayDoc; h: ReturnType<typeof harness> };

const make_sim = (doc: ReplayDoc): Sim => {
	const h = harness({ seed: doc.seed, fixed_dt: doc.fixed_dt, bindings: game_bindings });
	game_plugin(h.world, h.schedule);
	replay.play(doc, h.input, () => h.time.tick);
	h.time.advance(doc.fixed_dt);
	h.schedule.tick(h.world, h.ctx);
	return {
		ctx: h.ctx,
		w: h.world,
		doc,
		h,
		tick: () => {
			h.time.advance(doc.fixed_dt);
			h.schedule.tick(h.world, h.ctx);
		},
	};
};

const advance_to = (sim: Sim, target_tick: number): void => {
	const ctx = sim.ctx as Ctx & { time: { tick: number } };
	while (ctx.time.tick < target_tick) sim.tick();
};

const advance_to_end = (sim: Sim): void => {
	const last = sim.doc.frames[sim.doc.frames.length - 1]?.tick ?? 0;
	advance_to(sim, Math.max(last + 1, EXPECTED_END_TICK));
};

// canonical_stringify — JSON.stringify with sorted object keys at every
// depth. Required because Zod's safeParse on restore re-orders keys per
// the schema definition, so a sim coming out of restore writes resources
// with a different key insertion order than the live sim. The shape +
// values are identical; only the JSON encoding differs.
// Copied verbatim from subsystems/loot/test/replay.test.ts.
const canonical_stringify = (v: unknown): string => {
	const seen = new WeakSet<object>();
	const walk = (x: unknown): unknown => {
		if (x === null || typeof x !== "object") return x;
		if (seen.has(x as object)) return null;
		seen.add(x as object);
		if (Array.isArray(x)) return x.map(walk);
		const entries = Object.keys(x as Record<string, unknown>).sort();
		const out: Record<string, unknown> = {};
		for (const k of entries) out[k] = walk((x as Record<string, unknown>)[k]);
		return out;
	};
	return JSON.stringify(walk(v));
};

const player_view = (w: World) => {
	for (const [, p, vp, xp, perks, st, hp] of w
		.query([player_c, pos_c, visual_pos_c, xp_c, perks_c, stats_c, hp_c] as const)
		.collect()) {
		return { pos: { x: p.x, y: p.y }, visual: { x: vp.x, y: vp.y }, xp, perks, st, hp };
	}
	return null;
};

const collect_chaser_cells = (w: World): Array<{ x: number; y: number }> => {
	const out: Array<{ x: number; y: number }> = [];
	for (const [, p] of w.query([chaser_c, pos_c] as const).collect()) {
		out.push(g.world_to_cell(p.x, p.y));
	}
	out.sort((a, b) => a.y - b.y || a.x - b.x);
	return out;
};

// World hash projection per .plans/progress.md §6 "World hash for
// progress". Transient fields excluded:
//   - progress_r.dirty_stats (cleared mid-tick by stats_recompute)
//   - creature_occupancy_r (rebuilt every tick from queries)
//   - wall_index_r (empty in progress v1, but transient by contract)
const world_hash = (sim: Sim): string => {
	const pv = player_view(sim.w);
	const prog = sim.ctx.res.get(progress_r);
	const lvl = sim.ctx.res.get(level_up_pending_r);
	const ss = sim.ctx.res.get(swing_state_r);
	const ctx = sim.ctx as Ctx & { time: { tick: number } };
	const snap = {
		player_pos: pv
			? { x: Math.round(pv.pos.x * 1e6) / 1e6, y: Math.round(pv.pos.y * 1e6) / 1e6 }
			: null,
		player_visual: pv
			? { x: Math.round(pv.visual.x * 1e6) / 1e6, y: Math.round(pv.visual.y * 1e6) / 1e6 }
			: null,
		player_xp: pv ? pv.xp : null,
		player_perks: pv ? pv.perks.applied : null,
		player_stats: pv ? pv.st : null,
		player_hp: pv ? pv.hp : null,
		chasers: collect_chaser_cells(sim.w),
		progress: prog.ok ? { paused: prog.value.paused, dead: prog.value.dead } : null,
		level_up_pending: lvl.ok ? lvl.value : null,
		swing_state: ss.ok ? ss.value : null,
		tick: ctx.time.tick,
	};
	return createHash("sha256").update(canonical_stringify(snap)).digest("hex");
};

// make_restore_target — boot a fresh sim and run its startup tick BEFORE
// returning so the perk_registry_r etc. are rehydrated. The subsequent
// snapper.restore() call clears all entities and rewrites snapshot-
// registered resources; the startup-only static config (perk_registry_r)
// is left intact because it isn't in the snapshot blob. Mirrors
// loot/test/replay.test.ts:make_restore_target verbatim.
const make_restore_target = (doc: ReplayDoc): { h: ReturnType<typeof harness>; sim: Sim } => {
	const h = harness({ seed: doc.seed, fixed_dt: doc.fixed_dt, bindings: game_bindings });
	game_plugin(h.world, h.schedule);
	h.time.advance(doc.fixed_dt);
	h.schedule.tick(h.world, h.ctx);
	const sim: Sim = {
		ctx: h.ctx,
		w: h.world,
		doc,
		h,
		tick: () => {
			h.time.advance(doc.fixed_dt);
			h.schedule.tick(h.world, h.ctx);
		},
	};
	return { h, sim };
};

describe("progress replay deliverable", () => {
	test(
		"replay JSON loads and validates against replay_schema",
		() => {
			const r = replay.load(replay_json);
			expect(r.ok).toBe(true);
			if (!r.ok) return;
			const parsed = replay_schema.safeParse(JSON.parse(replay_json));
			expect(parsed.success).toBe(true);
			expect(r.value.seed).toBe(1);
			expect(r.value.fixed_dt).toBeCloseTo(1 / 60);
			expect(r.value.frames.length).toBeGreaterThan(0);
		},
		REPLAY_TIMEOUT_MS,
	);

	test(
		"after first level-up + pick, perks_c.applied === [perk.atk_plus]",
		() => {
			const r = replay.load(replay_json);
			expect(r.ok).toBe(true);
			if (!r.ok) return;
			const sim = make_sim(r.value);
			advance_to(sim, TICK_AFTER_FIRST_PICK);
			const pv = player_view(sim.w);
			expect(pv).not.toBeNull();
			if (!pv) return;
			expect(pv.xp.level).toBe(2);
			expect(pv.perks.applied).toEqual(["perk.atk_plus"]);
			const prog = sim.ctx.res.get(progress_r);
			expect(prog.ok).toBe(true);
			if (prog.ok) expect(prog.value.paused).toBe(false);
		},
		REPLAY_TIMEOUT_MS,
	);

	test(
		"player survives all 3 picks — progress_r.dead is false at end",
		() => {
			// Phase 5.4.bugfix3 introduced the melee swing window
			// (SWING_WINDOW_TICKS frames per Z press); the recorder's greedy
			// nearest-target strategy now reliably outpaces multi-chaser flank
			// damage and the player survives long enough to make all three
			// picks. This test asserts the survive-and-pick outcome.
			const r = replay.load(replay_json);
			expect(r.ok).toBe(true);
			if (!r.ok) return;
			const sim = make_sim(r.value);
			advance_to_end(sim);
			const prog = sim.ctx.res.get(progress_r);
			expect(prog.ok).toBe(true);
			if (!prog.ok) return;
			expect(prog.value.dead).toBe(false);
		},
		REPLAY_TIMEOUT_MS,
	);

	test(
		"snapshot round-trip mid-replay preserves world hash",
		() => {
			const r = replay.load(replay_json);
			expect(r.ok).toBe(true);
			if (!r.ok) return;
			const sim = make_sim(r.value);
			advance_to(sim, MID_REPLAY_SNAP_TICK);

			const snap = make_progress_snapshotter().take(sim.w, {
				time: sim.h.time,
				rng: sim.h.rng,
				res: sim.h.res,
			});
			expect(snap.ok).toBe(true);
			if (!snap.ok) return;

			const hash_a = world_hash(sim);

			const { sim: sim_b } = make_restore_target(r.value);
			const res = make_progress_snapshotter().restore(sim_b.w, snap.value, {
				time: sim_b.h.time,
				rng: sim_b.h.rng,
				res: sim_b.h.res,
			});
			expect(res.ok).toBe(true);
			const hash_b = world_hash(sim_b);
			expect(hash_b).toBe(hash_a);
		},
		REPLAY_TIMEOUT_MS,
	);

	test(
		"continue from restored state, end state matches non-restored continuation",
		() => {
			const r = replay.load(replay_json);
			expect(r.ok).toBe(true);
			if (!r.ok) return;

			const sim_a = make_sim(r.value);
			advance_to(sim_a, MID_REPLAY_SNAP_TICK);
			const snap = make_progress_snapshotter().take(sim_a.w, {
				time: sim_a.h.time,
				rng: sim_a.h.rng,
				res: sim_a.h.res,
			});
			expect(snap.ok).toBe(true);
			if (!snap.ok) return;

			const r2 = replay.load(replay_json);
			expect(r2.ok).toBe(true);
			if (!r2.ok) return;
			const { sim: sim_b } = make_restore_target(r2.value);
			make_progress_snapshotter().restore(sim_b.w, snap.value, {
				time: sim_b.h.time,
				rng: sim_b.h.rng,
				res: sim_b.h.res,
			});
			// Attach the replay AFTER restore so any post-snapshot events fire
			// (third pick at tick 1453 + axis releases on the settle ramp).
			replay.play(r2.value, sim_b.h.input, () => sim_b.h.time.tick);

			advance_to_end(sim_a);
			advance_to(sim_b, EXPECTED_END_TICK);

			expect(world_hash(sim_b)).toBe(world_hash(sim_a));
		},
		REPLAY_TIMEOUT_MS,
	);

	test(
		"stats_c + perks_c match expected base + perk modifiers at end of replay",
		() => {
			const r = replay.load(replay_json);
			expect(r.ok).toBe(true);
			if (!r.ok) return;
			const sim = make_sim(r.value);
			advance_to_end(sim);
			const pv = player_view(sim.w);
			expect(pv).not.toBeNull();
			if (!pv) return;
			expect(pv.st).toEqual({ ...EXPECTED_FINAL_STATS });
			expect(pv.perks.applied).toEqual(EXPECTED_FINAL_PERKS);
			expect(pv.xp.level).toBe(EXPECTED_FINAL_LEVEL);
		},
		REPLAY_TIMEOUT_MS,
	);

	test(
		"two consecutive replay runs produce byte-identical world hashes",
		() => {
			const r1 = replay.load(replay_json);
			const r2 = replay.load(replay_json);
			expect(r1.ok).toBe(true);
			expect(r2.ok).toBe(true);
			if (!r1.ok || !r2.ok) return;
			const sim_a = make_sim(r1.value);
			const sim_b = make_sim(r2.value);
			advance_to_end(sim_a);
			advance_to_end(sim_b);
			expect(world_hash(sim_b)).toBe(world_hash(sim_a));
		},
		REPLAY_TIMEOUT_MS * 2,
	);

	test(
		"disk-format round-trip: JSON.stringify -> safeParse -> restore preserves world hash",
		() => {
			// The new load-bearing assertion: proves the wire-format (JSON
			// string in localStorage → JSON.parse → snapshot_schema.safeParse)
			// survives a round-trip with no shape drift. The combination of
			// canonical_stringify (sorts keys) + safeParse (re-normalises key
			// order per schema) is what makes the world-hash byte-stable.
			const r = replay.load(replay_json);
			expect(r.ok).toBe(true);
			if (!r.ok) return;
			const sim = make_sim(r.value);
			advance_to(sim, MID_REPLAY_SNAP_TICK);

			const snap = make_progress_snapshotter().take(sim.w, {
				time: sim.h.time,
				rng: sim.h.rng,
				res: sim.h.res,
			});
			expect(snap.ok).toBe(true);
			if (!snap.ok) return;

			// Wire-format round-trip via JSON.
			const raw = JSON.stringify(snap.value);
			const parsed: unknown = JSON.parse(raw);
			const validated = snapshot_schema.safeParse(parsed);
			expect(validated.success).toBe(true);
			if (!validated.success) return;

			const { sim: sim_b } = make_restore_target(r.value);
			const restored = make_progress_snapshotter().restore(sim_b.w, validated.data, {
				time: sim_b.h.time,
				rng: sim_b.h.rng,
				res: sim_b.h.res,
			});
			expect(restored.ok).toBe(true);

			expect(world_hash(sim_b)).toBe(world_hash(sim));
		},
		REPLAY_TIMEOUT_MS,
	);
});
