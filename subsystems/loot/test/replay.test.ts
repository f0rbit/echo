import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
	harness,
	pos_c,
	replay,
	replay_schema,
	type Ctx,
	type ReplayDoc,
	type World,
} from "@f0rbit/forge";
import { game_bindings } from "../src/bindings.ts";
import {
	equipment_c,
	inventory_c,
	pickup_c,
	player_c,
	stats_c,
	visual_pos_c,
} from "../src/components.ts";
import { g } from "../src/grid.ts";
import { inventory_ui_r } from "../src/resources.ts";
import { make_loot_snapshotter } from "../src/snapshot.ts";
import { game_plugin } from "../src/plugin.ts";

const REPLAY_TIMEOUT_MS = 30000;
const replay_path = new URL("../replays/equip-and-stat.replay.json", import.meta.url).pathname;
const replay_json = readFileSync(replay_path, "utf8");

// Baked end-state values (recorded by tools/record-equip-and-stat.ts on seed=1).
const EXPECTED_INVENTORY_FIRST_THREE: readonly (string | null)[] = [
	"item.mace_heavy",
	"item.ring_of_power",
	"item.ring_of_warding",
];
const EXPECTED_WEAPON_AFTER_FIRST_CLICK = "item.mace_heavy";
// BASE atk=5; mace adds +5; ring_of_power adds +1; ring_of_warding adds 0
// (def +1). Final atk = 11. After first equip click (mace only): 5 + 5 = 10.
const EXPECTED_ATK_AFTER_FIRST_CLICK = 10;
const EXPECTED_FINAL_STATS = { atk: 11, def: 3, hp: 10, spd: 1 } as const;
// The recorder runs until tick 148 (see record-equip-and-stat.ts).
const EXPECTED_END_TICK = 148;

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

const player_view = (w: World) => {
	for (const [, p, vp, inv, eq, st] of w
		.query([player_c, pos_c, visual_pos_c, inventory_c, equipment_c, stats_c] as const)
		.collect()) {
		return { pos: { x: p.x, y: p.y }, visual: { x: vp.x, y: vp.y }, inv, eq, st };
	}
	return null;
};

const collect_pickups = (w: World): Array<{ cell: { x: number; y: number }; item_id: string }> => {
	const out: Array<{ cell: { x: number; y: number }; item_id: string }> = [];
	for (const [, p, pk] of w.query([pos_c, pickup_c] as const).collect()) {
		out.push({ cell: g.world_to_cell(p.x, p.y), item_id: pk.item_id });
	}
	out.sort((a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x || a.item_id.localeCompare(b.item_id));
	return out;
};

// canonical_stringify — JSON.stringify with sorted object keys at every
// depth. Required because Zod's safeParse on restore re-orders keys per the
// schema definition, so a sim coming out of restore writes stats/equipment
// with a different key insertion order than the live sim (which got its
// stats from compute_stats and its equipment from equip_item, both of which
// produce a different key order). The shape + values are identical; only
// the JSON encoding differs.
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

const world_hash = (sim: Sim): string => {
	const pv = player_view(sim.w);
	const ui = sim.ctx.res.get(inventory_ui_r);
	// Per .plans/loot.md §6 + the prompt: explicitly EXCLUDE dirty_stats and
	// pending_click_idx from the hash — they're transient flags that diverge
	// between original and restored sims.
	const ui_subset = ui.ok ? { open: ui.value.open, selected_slot: ui.value.selected_slot } : null;
	const ctx = sim.ctx as Ctx & { time: { tick: number } };
	const snap = {
		player_pos: pv ? { x: Math.round(pv.pos.x * 1e6) / 1e6, y: Math.round(pv.pos.y * 1e6) / 1e6 } : null,
		player_visual: pv ? { x: Math.round(pv.visual.x * 1e6) / 1e6, y: Math.round(pv.visual.y * 1e6) / 1e6 } : null,
		pickups: collect_pickups(sim.w),
		inventory: pv ? pv.inv.slots : null,
		equipment: pv ? pv.eq : null,
		stats: pv ? pv.st : null,
		ui: ui_subset,
		tick: ctx.time.tick,
	};
	return createHash("sha256").update(canonical_stringify(snap)).digest("hex");
};

// make_restore_target — build a fully-functional sim primed for restore.
// We install game_plugin so the schedule has all systems wired, then run
// the boot tick (which calls arena_gen's startup phase to seed the
// registry + arena_r and spawn a placeholder world). The subsequent
// restore() call clears all entities and rewrites snapshot-registered
// resources, so the placeholder state is harmless.
//
// item_registry_r is NOT in the snapshot (per §2 Q11), so we rely on
// arena_gen's startup pass to re-create it before the snapshot's
// inventory items are looked up by name post-restore.
const make_restore_target = (doc: ReplayDoc): { h: ReturnType<typeof harness>; sim: Sim } => {
	const h = harness({ seed: doc.seed, fixed_dt: doc.fixed_dt, bindings: game_bindings });
	game_plugin(h.world, h.schedule);
	// Boot tick — runs startup → arena_gen → seeds item_registry_r etc.
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

describe("loot replay deliverable", () => {
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
		"after pickup phase, inventory contains the 3 expected items in order",
		() => {
			const r = replay.load(replay_json);
			expect(r.ok).toBe(true);
			if (!r.ok) return;
			const sim = make_sim(r.value);
			// Walk ends around tick 111; advance to tick 115 — past the last
			// pickup commit but BEFORE the first equip click (tick 120) so the
			// items are still in inventory slots rather than equipment.
			advance_to(sim, 115);
			const pv = player_view(sim.w);
			expect(pv).not.toBeNull();
			if (!pv) return;
			expect(pv.inv.slots[0]).toBe(EXPECTED_INVENTORY_FIRST_THREE[0]!);
			expect(pv.inv.slots[1]).toBe(EXPECTED_INVENTORY_FIRST_THREE[1]!);
			expect(pv.inv.slots[2]).toBe(EXPECTED_INVENTORY_FIRST_THREE[2]!);
			expect(pv.inv.slots.slice(3).every(s => s === null)).toBe(true);
		},
		REPLAY_TIMEOUT_MS,
	);

	test(
		"after first equip click, equipment_c.weapon === mace_heavy",
		() => {
			const r = replay.load(replay_json);
			expect(r.ok).toBe(true);
			if (!r.ok) return;
			const sim = make_sim(r.value);
			// First click is at tick 120 (OPEN_TICK=115, CLICK_BASE_TICK=119);
			// advance a few ticks past the press edge.
			advance_to(sim, 122);
			const pv = player_view(sim.w);
			expect(pv).not.toBeNull();
			if (!pv) return;
			expect(pv.eq.weapon).toBe(EXPECTED_WEAPON_AFTER_FIRST_CLICK);
		},
		REPLAY_TIMEOUT_MS,
	);

	test(
		"after first equip click, stats_c.atk === base.atk + mace.atk",
		() => {
			const r = replay.load(replay_json);
			expect(r.ok).toBe(true);
			if (!r.ok) return;
			const sim = make_sim(r.value);
			advance_to(sim, 122);
			const pv = player_view(sim.w);
			expect(pv).not.toBeNull();
			if (!pv) return;
			expect(pv.st.atk).toBe(EXPECTED_ATK_AFTER_FIRST_CLICK);
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
			// Pick a mid-replay tick: just after the second equip click
			// (tick 126; third click fires at 132).
			const snap_tick = 130;
			advance_to(sim, snap_tick);

			const snap = make_loot_snapshotter().take(sim.w, {
				time: sim.h.time,
				rng: sim.h.rng,
				res: sim.h.res,
			});
			expect(snap.ok).toBe(true);
			if (!snap.ok) return;

			const hash_a = world_hash(sim);

			const { sim: sim_b } = make_restore_target(r.value);
			const res = make_loot_snapshotter().restore(sim_b.w, snap.value, {
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

			const snap_tick = 130;

			const sim_a = make_sim(r.value);
			advance_to(sim_a, snap_tick);
			const snap = make_loot_snapshotter().take(sim_a.w, {
				time: sim_a.h.time,
				rng: sim_a.h.rng,
				res: sim_a.h.res,
			});
			expect(snap.ok).toBe(true);
			if (!snap.ok) return;

			// Build a parallel sim by restoring into a blank world + attaching the
			// replay AFTER restore (so playback continues from snap_tick).
			const r2 = replay.load(replay_json);
			expect(r2.ok).toBe(true);
			if (!r2.ok) return;
			const { sim: sim_b } = make_restore_target(r2.value);
			make_loot_snapshotter().restore(sim_b.w, snap.value, {
				time: sim_b.h.time,
				rng: sim_b.h.rng,
				res: sim_b.h.res,
			});
			// Attach the replay AFTER restore — it'll inject any events still
			// scheduled at ticks > snap_tick. (slot_click_2 fires at tick 132,
			// after snap_tick=130, so this path IS exercised.)
			replay.play(r2.value, sim_b.h.input, () => sim_b.h.time.tick);

			advance_to_end(sim_a);
			advance_to(sim_b, EXPECTED_END_TICK);

			expect(world_hash(sim_b)).toBe(world_hash(sim_a));
		},
		REPLAY_TIMEOUT_MS,
	);

	test(
		"stats_c.atk === expected_post_equip_value at end of replay",
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
			expect(pv.eq.weapon).toBe("item.mace_heavy");
			expect(pv.eq.ring1).toBe("item.ring_of_power");
			expect(pv.eq.ring2).toBe("item.ring_of_warding");
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
});
