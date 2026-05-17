import type { Ctx, Snapshotter, System, World } from "@f0rbit/forge";
import { chaser_c, player_c, xp_c } from "../components.ts";
import { progress_r } from "../resources.ts";
import { disk_save, type DiskError } from "../disk-save.ts";

// auto-save.ts — post-stage system that persists a snapshot on
// "interesting" world transitions: a chaser dies (chaser_count decreases)
// OR the player's xp_c.level changes. Closure-state holds the previous
// tick's values so no other system needs to be touched (per .plans/
// progress.md §5 Phase 5.5 — auto-save is decoupled from xp.ts /
// melee-swing.ts).
//
// Skipped while progress_r.paused (level-up modal up): the snapshot would
// capture mid-pause state, and the player has not yet committed to a
// perk choice. A save fires AFTER the perk is picked and `paused` flips
// back to false — that's a level change vs the previous-saved level, so
// it auto-saves naturally.
//
// Initial last_* values are sentinel `-1`; the first tick after boot
// initialises them without saving (snapshot triggers only on a CHANGE
// from a known previous value, not on the first-known transition).

export type AutoSaveOpts = {
	snapper: Snapshotter;
	disk_save_fn?: (s: import("@f0rbit/forge").Snapshot) => import("@f0rbit/corpus").Result<void, DiskError>;
};

const count_chasers = (w: World): number =>
	w.query([chaser_c] as const).collect().length;

const player_level = (w: World): number | null => {
	const rows = w.query([player_c, xp_c] as const).collect();
	const first = rows[0];
	if (!first) return null;
	return first[1].level;
};

export const make_auto_save_system = (opts: AutoSaveOpts): System => {
	const save_fn = opts.disk_save_fn ?? disk_save;
	let last_chaser_count = -1;
	let last_level = -1;
	let initialised = false;

	return (w: World, ctx: Ctx): void => {
		const prog = ctx.res.get(progress_r);
		if (prog.ok && prog.value.paused) return;

		const cur_chasers = count_chasers(w);
		const cur_level = player_level(w) ?? -1;

		if (!initialised) {
			last_chaser_count = cur_chasers;
			last_level = cur_level;
			initialised = true;
			return;
		}

		const chaser_decreased = cur_chasers < last_chaser_count;
		const level_changed = cur_level !== last_level;

		last_chaser_count = cur_chasers;
		last_level = cur_level;

		if (!chaser_decreased && !level_changed) return;

		const snap = opts.snapper.take(w, { time: ctx.time, rng: ctx.rng, res: ctx.res });
		if (!snap.ok) return;
		save_fn(snap.value);
	};
};
