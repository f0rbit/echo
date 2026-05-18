import type { Ctx, Schedule, Snapshotter, System, World } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { make_wall_autotile_system } from "@f0rbit/forge/autotile";
import type { Graphics } from "pixi.js";
import {
	chaser_c,
	dir_c,
	floor_c,
	hp_c,
	path_c,
	perks_c,
	player_c,
	state_c,
	stats_c,
	visual_pos_c,
	wall_c,
	xp_c,
} from "./components.ts";
import { g } from "./grid.ts";
import {
	arena_r,
	creature_occupancy_r,
	level_up_pending_r,
	perk_registry_r,
	progress_r,
	run_seed_r,
	wall_index_r,
} from "./resources.ts";
import { make_perk_registry } from "./data/perks.ts";
import { chaser_think_system } from "./systems/ai-chaser.ts";
import { make_contact_damage_system } from "./systems/contact-damage.ts";
import { creature_occupancy_system } from "./systems/creature-occupancy.ts";
import { make_entity_render_system } from "./systems/entity-render.ts";
import { make_melee_swing_system } from "./systems/melee-swing.ts";
import { movement_system, step_every } from "./systems/movement.ts";
import { path_step_system } from "./systems/path-step.ts";
import { make_perks_system, type PerksSystem } from "./systems/perks.ts";
import { sprite_attach_system } from "./systems/sprite-attach.ts";
import { BASE_STATS, make_stats_recompute_system } from "./systems/stats.ts";
import { make_synthetic_perk_pick_system } from "./systems/synthetic-perk-pick.ts";
import { tween_step_system } from "./systems/tween.ts";
import { make_xp_system, type XpSystem } from "./systems/xp.ts";
import { make_progress_snapshotter } from "./snapshot.ts";
import { disk_save } from "./disk-save.ts";

// debug-plugin.ts — stripped progress scene for visual fixture verification.
//
// Differences from `game_plugin`:
//   - No `restart` system (page reload resets the demo).
//   - No `input` system — `debug_auto_action` writes dir_c directly.
//   - No `enemy_spawn` — chasers spawned by `debug_auto_action` on a
//     scripted schedule. Direct `xp_sys.emit_xp_gain` bypasses real combat
//     so the level-up cycle is deterministic without choreographing melee.
//   - Custom `debug_setup_progress` mirrors `setup_arena` but is
//     locally-owned (no shared helper).
//
// Auto-action schedule (per .plans/progress.md §5 Phase 5.7):
//   tick 0    → startup spawns player at (10, 5), resources seeded.
//   tick 5    → spawn chaser_1 at (5, 5).
//   ticks 5..30 → player walks right (dir_c = {dx:1, dy:0}).
//   tick 30   → despawn chaser_1 + emit_xp_gain(100) → level 1→2 triggers.
//   tick 40   → queue_perk_pick(0).
//   tick 55   → spawn chaser_2; walk; tick 80 kill + emit_xp_gain(200).
//   tick 90   → queue_perk_pick(1).
//   tick 105  → spawn chaser_3; walk; tick 130 kill + emit_xp_gain(300).
//   tick 140  → queue_perk_pick(2).
//   tick 155  → snapper.take + disk_save (mid-fixture round-trip demo).
//   tick 160+ → idle; HUD shows final state (level 4, 3 perks applied).
//
// The 100/200/300 XP grants exactly match `xp_threshold(level) = 100*level`
// so each grant fires one level-up.

export type DebugPluginOpts = {
	entity_graphics?: Graphics;
	xp_system?: XpSystem;
	perks_system?: PerksSystem;
};

export type DebugPluginExports = {
	xp_sys: XpSystem;
	perks_sys: PerksSystem;
	snapper: Snapshotter;
};

const AI_TICK_EVERY = 12;
const PLAYER_SPAWN = { x: 10, y: 5 };
const CHASER_SPAWN = { x: 5, y: 5 };

const debug_setup_progress = (w: World, ctx: Ctx): void => {
	ctx.res.set(arena_r, {
		cols: g.cols,
		rows: g.rows,
		width: g.cols * g.tile,
		height: g.rows * g.tile,
	});
	ctx.res.set(run_seed_r, { base: ctx.rng.seed, restart_count: 0 });

	const reg = make_perk_registry();
	ctx.res.set(perk_registry_r, { perks: reg.perks as unknown as Map<string, unknown> });

	ctx.res.set(creature_occupancy_r, { cells: new Set<number>() });
	// Same perimeter ring as production setup_arena — keeps the debug
	// fixture's blocked-cell contract identical to the playable build.
	const walls = new Set<number>();
	for (let cx = 0; cx < g.cols; cx++) {
		walls.add(g.key(cx, 0));
		walls.add(g.key(cx, g.rows - 1));
	}
	for (let cy = 0; cy < g.rows; cy++) {
		walls.add(g.key(0, cy));
		walls.add(g.key(g.cols - 1, cy));
	}
	ctx.res.set(wall_index_r, { cells: walls });
	ctx.res.set(progress_r, { paused: false, dirty_stats: false, dead: false });
	ctx.res.set(level_up_pending_r, { pending: false, choices: [] });

	for (let cy = 0; cy < g.rows; cy++) {
		for (let cx = 0; cx < g.cols; cx++) {
			const p = g.cell_to_world(cx, cy);
			w.spawn([pos_c, p], [visual_pos_c, { ...p }], [floor_c, true]);
		}
	}
	for (let cy = 0; cy < g.rows; cy++) {
		for (let cx = 0; cx < g.cols; cx++) {
			const on_edge = cx === 0 || cx === g.cols - 1 || cy === 0 || cy === g.rows - 1;
			if (!on_edge) continue;
			const p = g.cell_to_world(cx, cy);
			w.spawn([pos_c, p], [visual_pos_c, { ...p }], [wall_c, true]);
		}
	}

	const wp = g.cell_to_world(PLAYER_SPAWN.x, PLAYER_SPAWN.y);
	w.spawn(
		[player_c, true],
		[pos_c, wp],
		[visual_pos_c, { ...wp }],
		[dir_c, { dx: 0, dy: 0 }],
		[hp_c, { current: BASE_STATS.max_hp, max: BASE_STATS.max_hp }],
		[xp_c, { current: 0, level: 1 }],
		[perks_c, { applied: [] }],
		[stats_c, { ...BASE_STATS }],
	);
};

const spawn_chaser = (w: World): void => {
	const wp = g.cell_to_world(CHASER_SPAWN.x, CHASER_SPAWN.y);
	w.spawn(
		[chaser_c, true],
		[pos_c, wp],
		[visual_pos_c, { ...wp }],
		[dir_c, { dx: 0, dy: 0 }],
		[hp_c, { current: 1, max: 1 }],
		[state_c, { kind: "idle" }],
		[path_c, { cells: [], idx: 0 }],
	);
};

const despawn_first_chaser = (w: World): void => {
	const chasers = w.query([chaser_c] as const).collect();
	const first = chasers[0];
	if (first) w.despawn(first[0]);
};

const set_player_dir = (w: World, dx: -1 | 0 | 1): void => {
	for (const [id] of w.query([player_c, dir_c] as const).collect()) {
		w.set(id, dir_c, { dx, dy: 0 });
	}
};

type AutoActionOpts = {
	xp_sys: XpSystem;
	perks_sys: PerksSystem;
	snapper: Snapshotter;
};

const make_debug_auto_action_system = (opts: AutoActionOpts): System => (w, ctx) => {
	const tick = ctx.time.tick;
	const prog = ctx.res.get(progress_r);
	const paused = prog.ok && prog.value.paused;

	// Walk-right phases: between cycles, only while not paused.
	const walking = !paused && ((tick >= 5 && tick < 30) || (tick >= 55 && tick < 80) || (tick >= 105 && tick < 130));
	if (walking) set_player_dir(w, 1);
	else set_player_dir(w, 0);

	// Spawn / kill / xp-grant edges.
	if (tick === 5 || tick === 55 || tick === 105) spawn_chaser(w);
	if (tick === 30) { despawn_first_chaser(w); opts.xp_sys.emit_xp_gain(100); }
	if (tick === 80) { despawn_first_chaser(w); opts.xp_sys.emit_xp_gain(200); }
	if (tick === 130) { despawn_first_chaser(w); opts.xp_sys.emit_xp_gain(300); }

	// Perk picks — fire after the level-up pause settles. The `perks` system
	// gates on `paused && pending`; queueing while gated is silently no-op'd.
	if (tick === 40) opts.perks_sys.queue_perk_pick(0);
	if (tick === 90) opts.perks_sys.queue_perk_pick(1);
	if (tick === 140) opts.perks_sys.queue_perk_pick(2);

	// Disk-save round-trip demo — mid-fixture, after all 3 perks applied.
	if (tick === 155) {
		const snap = opts.snapper.take(w, { time: ctx.time, rng: ctx.rng, res: ctx.res });
		if (snap.ok) {
			const saved = disk_save(snap.value);
			if (!saved.ok) console.warn("[progress debug] disk_save:", saved.error); // non-deterministic-ok: dev diagnostic
		} else {
			console.warn("[progress debug] snapper.take:", snap.error); // non-deterministic-ok: dev diagnostic
		}
	}
};

export const debug_plugin = (_w: World, sch: Schedule, opts: DebugPluginOpts = {}): DebugPluginExports => {
	const xp_sys = opts.xp_system ?? make_xp_system();
	const perks_sys = opts.perks_system ?? make_perks_system();
	const snapper = make_progress_snapshotter();

	sch.add("startup", (w, ctx) => debug_setup_progress(w, ctx), "pr.debug.setup");
	sch.add("startup", make_wall_autotile_system({ wall_c, texture: "walls", grid: g }), { name: "pr.debug.wall_autotile" });

	sch.add("pre", creature_occupancy_system, { name: "pr.creature_occupancy" });

	sch.add("update", make_debug_auto_action_system({ xp_sys, perks_sys, snapper }), { phase: 0, name: "pr.debug_auto_action" });
	sch.add("update", movement_system, { every: step_every, phase: 1, name: "pr.movement" });
	sch.add("update", tween_step_system, { phase: 2, name: "pr.tween" });
	sch.add("update", chaser_think_system, { every: AI_TICK_EVERY, phase: 3, name: "pr.ai_chaser" });
	sch.add("update", path_step_system, { every: step_every, phase: 4, name: "pr.path_step" });
	sch.add("update", make_melee_swing_system(xp_sys), { phase: 6, name: "pr.melee_swing" });
	sch.add("update", make_contact_damage_system(), { phase: 6.5, name: "pr.contact_damage" });
	sch.add("update", xp_sys.system, { phase: 7, name: "pr.xp" });
	sch.add("update", make_synthetic_perk_pick_system(perks_sys.queue_perk_pick), { phase: 7.5, name: "pr.synthetic_perk_pick" });
	sch.add("update", perks_sys.system, { phase: 8, name: "pr.perks" });
	sch.add("update", make_stats_recompute_system(), { phase: 9, name: "pr.stats_recompute" });

	sch.add("post", sprite_attach_system, { phase: 0, name: "pr.sprite_attach" });

	if (opts.entity_graphics) {
		sch.add("render", make_entity_render_system(opts.entity_graphics), { phase: 10, name: "pr.entity_render" });
	}

	return { xp_sys, perks_sys, snapper };
};
