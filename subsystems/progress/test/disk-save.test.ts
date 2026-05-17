import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { pos_c, type Snapshot } from "@f0rbit/forge";
import { disk_clear, disk_load, disk_save } from "../src/disk-save.ts";
import { make_progress_snapshotter } from "../src/snapshot.ts";
import { make_progress_scenario, make_restore_target } from "./fixtures/progress-scenario.ts";
import {
	chaser_c,
	hp_c,
	perks_c,
	player_c,
	stats_c,
	xp_c,
} from "../src/components.ts";
import { level_up_pending_r, progress_r } from "../src/resources.ts";

// disk-save.test.ts — Phase 5.5. Exercises the localStorage transport
// (disk_save / disk_load / disk_clear) and the snapshot round-trip across
// JSON.stringify + safeParse. Uses an in-memory Map-backed Storage shim
// (echo AGENTS.md "in-memory representations").

type Globals = { localStorage?: Storage };
const g = globalThis as unknown as Globals;

const make_storage_shim = (): Storage => {
	const store = new Map<string, string>();
	const shim: Storage = {
		get length() { return store.size; },
		clear: () => store.clear(),
		getItem: (k) => (store.has(k) ? store.get(k)! : null),
		key: (i) => Array.from(store.keys())[i] ?? null,
		removeItem: (k) => { store.delete(k); },
		setItem: (k, v) => { store.set(k, v); },
	};
	return shim;
};

let original_storage: Storage | undefined;

beforeEach(() => {
	original_storage = g.localStorage;
	g.localStorage = make_storage_shim();
});

afterEach(() => {
	if (original_storage === undefined) delete g.localStorage;
	else g.localStorage = original_storage;
});

describe("disk_save / disk_load — localStorage transport", () => {
	test("load with empty storage returns no_save", () => {
		const r = disk_load();
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error.kind).toBe("no_save");
	});

	test("save → load round-trip yields a structurally-equal snapshot", () => {
		const scn = make_progress_scenario({ with_player: true, with_chasers: 3 });
		const snap = make_progress_snapshotter().take(scn.h.world, {
			time: scn.h.time,
			rng: scn.h.rng,
			res: scn.h.res,
		});
		expect(snap.ok).toBe(true);
		if (!snap.ok) return;

		const saved = disk_save(snap.value);
		expect(saved.ok).toBe(true);

		const loaded = disk_load();
		expect(loaded.ok).toBe(true);
		if (!loaded.ok) return;

		expect(loaded.value.version).toBe(1);
		expect(loaded.value.meta.tick).toBe(snap.value.meta.tick);
		expect(loaded.value.meta.rng_seed).toBe(snap.value.meta.rng_seed);
		expect(loaded.value.entities.length).toBe(snap.value.entities.length);
		expect(Object.keys(loaded.value.resources).sort()).toEqual(
			Object.keys(snap.value.resources).sort(),
		);
	});

	test("schema mismatch — a version: 2 blob fails with schema_validation", () => {
		const future: unknown = { version: 2, meta: { tick: 0, rng_state: 0, rng_seed: 1 }, entities: [], resources: {} };
		g.localStorage!.setItem("echo:progress:save:slot-1", JSON.stringify(future));
		const r = disk_load();
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error.kind).toBe("schema_validation");
	});

	test("invalid JSON in storage → parse error", () => {
		g.localStorage!.setItem("echo:progress:save:slot-1", "not-json{");
		const r = disk_load();
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error.kind).toBe("parse");
	});

	test("localStorage missing → browser_storage_unavailable for both ops", () => {
		delete g.localStorage;
		const save = disk_save({ version: 1, meta: { tick: 0, rng_state: 0, rng_seed: 1 }, entities: [], resources: {} });
		expect(save.ok).toBe(false);
		if (!save.ok) expect(save.error.kind).toBe("browser_storage_unavailable");

		const load = disk_load();
		expect(load.ok).toBe(false);
		if (!load.ok) expect(load.error.kind).toBe("browser_storage_unavailable");
	});

	test("disk_clear after save → next load returns no_save", () => {
		const scn = make_progress_scenario({ with_player: true });
		const snap = make_progress_snapshotter().take(scn.h.world, {
			time: scn.h.time,
			rng: scn.h.rng,
			res: scn.h.res,
		});
		expect(snap.ok).toBe(true);
		if (!snap.ok) return;
		disk_save(snap.value);
		expect(disk_load().ok).toBe(true);

		const cleared = disk_clear();
		expect(cleared.ok).toBe(true);
		const after = disk_load();
		expect(after.ok).toBe(false);
		if (after.ok) return;
		expect(after.error.kind).toBe("no_save");
	});

	test("full round-trip preserves player + chasers + paused state after restore", () => {
		const src = make_progress_scenario({ with_player: true, with_chasers: 4 });
		// Force a mid-level-up pause to verify gate resources round-trip.
		src.h.res.set(progress_r, { paused: true, dirty_stats: false });
		src.h.res.set(level_up_pending_r, { pending: true, choices: ["perk.atk_plus", "perk.def_plus", "perk.spd_plus"] });

		// Mutate player state so restore is observably different from default.
		const player_id = src.player_id!;
		src.h.world.set(player_id, xp_c, { current: 42, level: 3 });
		src.h.world.set(player_id, hp_c, { current: 7, max: 10 });
		src.h.world.set(player_id, perks_c, { applied: ["perk.atk_plus", "perk.hp_plus"] });
		src.h.world.set(player_id, stats_c, { atk: 8, def: 2, spd: 1, max_hp: 15, xp_gain_mul: 0.25 });

		const snapper = make_progress_snapshotter();
		const snap = snapper.take(src.h.world, { time: src.h.time, rng: src.h.rng, res: src.h.res });
		expect(snap.ok).toBe(true);
		if (!snap.ok) return;

		const save_r = disk_save(snap.value);
		expect(save_r.ok).toBe(true);

		// Fresh target with rehydrated registry (matches make_restore_target).
		const target = make_restore_target();
		const loaded = disk_load();
		expect(loaded.ok).toBe(true);
		if (!loaded.ok) return;

		const restored = snapper.restore(target.h.world, loaded.value, {
			time: target.h.time,
			rng: target.h.rng,
			res: target.h.res,
		});
		expect(restored.ok).toBe(true);

		const players = target.h.world.query([player_c, xp_c, hp_c, perks_c, stats_c] as const).collect();
		expect(players.length).toBe(1);
		const [, xp, hp, perks, stats] = players[0]!;
		expect(xp).toEqual({ current: 42, level: 3 });
		expect(hp).toEqual({ current: 7, max: 10 });
		expect(perks.applied).toEqual(["perk.atk_plus", "perk.hp_plus"]);
		expect(stats).toEqual({ atk: 8, def: 2, spd: 1, max_hp: 15, xp_gain_mul: 0.25 });

		const chasers = target.h.world.query([chaser_c, pos_c] as const).collect();
		expect(chasers.length).toBe(4);

		const prog = target.h.res.get(progress_r);
		expect(prog.ok).toBe(true);
		if (prog.ok) expect(prog.value.paused).toBe(true);

		const lvl = target.h.res.get(level_up_pending_r);
		expect(lvl.ok).toBe(true);
		if (lvl.ok) {
			expect(lvl.value.pending).toBe(true);
			expect(lvl.value.choices).toEqual(["perk.atk_plus", "perk.def_plus", "perk.spd_plus"]);
		}
	});

	test("snapshot blob omits non-snapshotted resources (perk_registry, creature_occupancy, wall_index)", () => {
		const scn = make_progress_scenario({ with_player: true });
		const snap = make_progress_snapshotter().take(scn.h.world, {
			time: scn.h.time,
			rng: scn.h.rng,
			res: scn.h.res,
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

describe("disk-save shape", () => {
	test("saved blob conforms to forge snapshot_schema after re-parse", () => {
		const scn = make_progress_scenario({ with_player: true });
		const snap = make_progress_snapshotter().take(scn.h.world, {
			time: scn.h.time,
			rng: scn.h.rng,
			res: scn.h.res,
		});
		expect(snap.ok).toBe(true);
		if (!snap.ok) return;

		const saved: Snapshot = snap.value;
		expect(saved.version).toBe(1);
		expect(typeof saved.meta.tick).toBe("number");
		expect(saved.entities.length).toBeGreaterThanOrEqual(1);

		const raw = JSON.stringify(saved);
		const round: unknown = JSON.parse(raw);
		expect((round as { version: number }).version).toBe(1);
	});
});
