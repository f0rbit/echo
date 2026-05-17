import { describe, expect, test } from "bun:test";
import { pos_c, type World } from "@f0rbit/forge";
import {
	chaser_c,
	hp_c,
	perks_c,
	player_c,
	stats_c,
	xp_c,
} from "../src/components.ts";
import { g } from "../src/grid.ts";
import { level_up_pending_r, progress_r } from "../src/resources.ts";
import { make_progress_snapshotter } from "../src/snapshot.ts";
import { make_progress_scenario, make_restore_target } from "./fixtures/progress-scenario.ts";

// snapshot.test.ts — focused round-trip unit tests for the progress
// snapshotter. Pairs with disk-save.test.ts (transport) and replay.test.ts
// (end-to-end via recorded fixture). Mirrors loot/test/snapshot.test.ts in
// scope: one tightly-scoped case per registered component / resource +
// the exclusion assertions.
//
// All tests use `make_progress_scenario` + `make_restore_target` from the
// fixture so the perk_registry_r is rehydrated on the target BEFORE
// restore (AGENTS.md "Snapshotter.restore() is destructive — boot the
// target first" + "Static config NOT in snapshot").

const collect_chaser_cells = (w: World): Array<{ x: number; y: number }> => {
	const out: Array<{ x: number; y: number }> = [];
	for (const [, p] of w.query([chaser_c, pos_c] as const).collect()) {
		out.push(g.world_to_cell(p.x, p.y));
	}
	out.sort((a, b) => a.y - b.y || a.x - b.x);
	return out;
};

const player_state = (w: World) => {
	for (const [id, xp, perks, st, hp] of w
		.query([player_c, xp_c, perks_c, stats_c, hp_c] as const)
		.collect()) {
		return { id, xp, perks, st, hp };
	}
	return null;
};

describe("progress snapshot round-trip", () => {
	test("empty world — just the player + base resources survive", () => {
		const src = make_progress_scenario({ with_player: true });
		const snap = make_progress_snapshotter().take(src.h.world, {
			time: src.h.time,
			rng: src.h.rng,
			res: src.h.res,
		});
		expect(snap.ok).toBe(true);
		if (!snap.ok) return;

		const tgt = make_restore_target();
		const res = make_progress_snapshotter().restore(tgt.h.world, snap.value, {
			time: tgt.h.time,
			rng: tgt.h.rng,
			res: tgt.h.res,
		});
		expect(res.ok).toBe(true);

		const a = player_state(src.h.world);
		const b = player_state(tgt.h.world);
		expect(a).not.toBeNull();
		expect(b).not.toBeNull();
		if (!a || !b) return;
		expect(b.xp).toEqual(a.xp);
		expect(b.perks).toEqual(a.perks);
		expect(b.st).toEqual(a.st);
		expect(b.hp).toEqual(a.hp);
	});

	test("xp_c — current + level preserved", () => {
		const src = make_progress_scenario({ with_player: true });
		src.h.world.set(src.player_id!, xp_c, { current: 50, level: 2 });

		const snap = make_progress_snapshotter().take(src.h.world, {
			time: src.h.time,
			rng: src.h.rng,
			res: src.h.res,
		});
		expect(snap.ok).toBe(true);
		if (!snap.ok) return;

		const tgt = make_restore_target();
		make_progress_snapshotter().restore(tgt.h.world, snap.value, {
			time: tgt.h.time,
			rng: tgt.h.rng,
			res: tgt.h.res,
		});

		const b = player_state(tgt.h.world);
		expect(b).not.toBeNull();
		if (!b) return;
		expect(b.xp).toEqual({ current: 50, level: 2 });
	});

	test("perks_c — applied list preserved in order", () => {
		const applied: readonly string[] = ["perk.atk_plus", "perk.def_plus", "perk.spd_plus"];
		const src = make_progress_scenario({ with_player: true });
		src.h.world.set(src.player_id!, perks_c, { applied });

		const snap = make_progress_snapshotter().take(src.h.world, {
			time: src.h.time,
			rng: src.h.rng,
			res: src.h.res,
		});
		expect(snap.ok).toBe(true);
		if (!snap.ok) return;

		const tgt = make_restore_target();
		make_progress_snapshotter().restore(tgt.h.world, snap.value, {
			time: tgt.h.time,
			rng: tgt.h.rng,
			res: tgt.h.res,
		});

		const b = player_state(tgt.h.world);
		expect(b).not.toBeNull();
		if (!b) return;
		expect(b.perks.applied).toEqual(applied);
	});

	test("hp_c — current + max preserved", () => {
		const src = make_progress_scenario({ with_player: true });
		src.h.world.set(src.player_id!, hp_c, { current: 7, max: 15 });

		const snap = make_progress_snapshotter().take(src.h.world, {
			time: src.h.time,
			rng: src.h.rng,
			res: src.h.res,
		});
		expect(snap.ok).toBe(true);
		if (!snap.ok) return;

		const tgt = make_restore_target();
		make_progress_snapshotter().restore(tgt.h.world, snap.value, {
			time: tgt.h.time,
			rng: tgt.h.rng,
			res: tgt.h.res,
		});

		const b = player_state(tgt.h.world);
		expect(b).not.toBeNull();
		if (!b) return;
		expect(b.hp).toEqual({ current: 7, max: 15 });
	});

	test("stats_c — every field of a multi-perk computed shape preserved", () => {
		const stats = { atk: 11, def: 4, spd: 1.15, max_hp: 15, xp_gain_mul: 0.25 };
		const src = make_progress_scenario({ with_player: true });
		src.h.world.set(src.player_id!, stats_c, stats);

		const snap = make_progress_snapshotter().take(src.h.world, {
			time: src.h.time,
			rng: src.h.rng,
			res: src.h.res,
		});
		expect(snap.ok).toBe(true);
		if (!snap.ok) return;

		const tgt = make_restore_target();
		make_progress_snapshotter().restore(tgt.h.world, snap.value, {
			time: tgt.h.time,
			rng: tgt.h.rng,
			res: tgt.h.res,
		});

		const b = player_state(tgt.h.world);
		expect(b).not.toBeNull();
		if (!b) return;
		expect(b.st).toEqual(stats);
	});

	test("paused-with-pending-choices — gate resources round-trip so UI mode survives", () => {
		const src = make_progress_scenario({ with_player: true });
		const choices = ["perk.atk_plus", "perk.def_plus", "perk.hp_plus"];
		src.h.res.set(progress_r, { paused: true, dirty_stats: false });
		src.h.res.set(level_up_pending_r, { pending: true, choices });

		const snap = make_progress_snapshotter().take(src.h.world, {
			time: src.h.time,
			rng: src.h.rng,
			res: src.h.res,
		});
		expect(snap.ok).toBe(true);
		if (!snap.ok) return;

		const tgt = make_restore_target();
		make_progress_snapshotter().restore(tgt.h.world, snap.value, {
			time: tgt.h.time,
			rng: tgt.h.rng,
			res: tgt.h.res,
		});

		const prog = tgt.h.res.get(progress_r);
		const lvl = tgt.h.res.get(level_up_pending_r);
		expect(prog.ok).toBe(true);
		expect(lvl.ok).toBe(true);
		if (!prog.ok || !lvl.ok) return;
		expect(prog.value.paused).toBe(true);
		expect(lvl.value.pending).toBe(true);
		expect(lvl.value.choices).toEqual(choices);
	});

	test("chasers + occupancy — chaser count + positions preserved (occupancy is transient)", () => {
		const src = make_progress_scenario({ with_player: true, with_chasers: 3 });
		const expected_cells = collect_chaser_cells(src.h.world);

		const snap = make_progress_snapshotter().take(src.h.world, {
			time: src.h.time,
			rng: src.h.rng,
			res: src.h.res,
		});
		expect(snap.ok).toBe(true);
		if (!snap.ok) return;

		const tgt = make_restore_target();
		make_progress_snapshotter().restore(tgt.h.world, snap.value, {
			time: tgt.h.time,
			rng: tgt.h.rng,
			res: tgt.h.res,
		});

		const restored = collect_chaser_cells(tgt.h.world);
		expect(restored.length).toBe(3);
		expect(restored).toEqual(expected_cells);
		// creature_occupancy_r is intentionally NOT snapshotted; it rebuilds
		// from the chaser query on the next tick.
	});

	test("perk_registry_r is NOT in the snapshot blob (rehydrated by setup_progress on restore)", () => {
		const src = make_progress_scenario({ with_player: true });
		const snap = make_progress_snapshotter().take(src.h.world, {
			time: src.h.time,
			rng: src.h.rng,
			res: src.h.res,
		});
		expect(snap.ok).toBe(true);
		if (!snap.ok) return;

		const keys = Object.keys(snap.value.resources);
		expect(keys).not.toContain("pr.perk_registry");
		expect(keys).not.toContain("pr.creature_occupancy");
		expect(keys).not.toContain("pr.wall_index");
		expect(keys).toContain("pr.arena");
		expect(keys).toContain("pr.run_seed");
		expect(keys).toContain("pr.progress");
		expect(keys).toContain("pr.level_up_pending");
	});
});
