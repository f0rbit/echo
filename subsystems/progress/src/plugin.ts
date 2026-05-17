import type { Schedule, World } from "@f0rbit/forge";
import type { Graphics } from "pixi.js";
import { make_arena_gen_system } from "./arena-gen.ts";
import { chaser_think_system } from "./systems/ai-chaser.ts";
import { creature_occupancy_system } from "./systems/creature-occupancy.ts";
import { make_enemy_spawn_system } from "./systems/enemy-spawn.ts";
import { make_entity_render_system } from "./systems/entity-render.ts";
import { make_input_system } from "./systems/input.ts";
import { make_melee_swing_system } from "./systems/melee-swing.ts";
import { movement_system, step_every } from "./systems/movement.ts";
import { path_step_system } from "./systems/path-step.ts";
import { make_perks_system, type PerksSystem } from "./systems/perks.ts";
import { make_restart_system } from "./systems/restart.ts";
import { make_stats_recompute_system } from "./systems/stats.ts";
import { tween_step_system } from "./systems/tween.ts";
import { make_xp_system, type XpSystem } from "./systems/xp.ts";

// plugin.ts — wires the schedule for Phase 5.3.
//
// Stage ordering (per .plans/progress.md §5 Phase 5.3 + loot's pattern):
//   startup → arena_gen
//   pre     → restart, creature_occupancy
//   update  → input → movement (every step_every) → tween → ai_chaser →
//             path_step (every step_every) → enemy_spawn → melee_swing →
//             xp → perks → stats_recompute
//   render  → entity_render (if a Graphics handle was passed in)
//
// Tween runs in `update` (not `post`) so the lerp lands before render.
// melee_swing must run BEFORE xp so the kill-emitted xp gain is drained
// on the same tick (closure-queued, see xp.ts).
//
// `make_xp_system()` + `make_perks_system()` return their factories.
// Returned to main.ts so UI overlays (Phase 5.4) can wire DOM click →
// `perks_sys.queue_perk_pick(idx)` and pinging xp_gain from any
// host-side code path.

const AI_TICK_EVERY = 12;

export type GamePluginOpts = {
	entity_graphics?: Graphics;
	xp_system?: XpSystem;
	perks_system?: PerksSystem;
};

export type GamePluginExports = {
	xp_sys: XpSystem;
	perks_sys: PerksSystem;
};

export const game_plugin = (_w: World, sch: Schedule, opts: GamePluginOpts = {}): GamePluginExports => {
	const xp_sys = opts.xp_system ?? make_xp_system();
	const perks_sys = opts.perks_system ?? make_perks_system();

	sch.add("startup", make_arena_gen_system(), { name: "pr.arena_gen" });

	sch.add("pre", make_restart_system(), { name: "pr.restart" });
	sch.add("pre", creature_occupancy_system, { name: "pr.creature_occupancy" });

	sch.add("update", make_input_system(perks_sys), { phase: 0, name: "pr.input" });
	sch.add("update", movement_system, { every: step_every, phase: 1, name: "pr.movement" });
	sch.add("update", tween_step_system, { phase: 2, name: "pr.tween" });
	sch.add("update", chaser_think_system, { every: AI_TICK_EVERY, phase: 3, name: "pr.ai_chaser" });
	sch.add("update", path_step_system, { every: step_every, phase: 4, name: "pr.path_step" });
	sch.add("update", make_enemy_spawn_system(), { phase: 5, name: "pr.enemy_spawn" });
	sch.add("update", make_melee_swing_system(xp_sys), { phase: 6, name: "pr.melee_swing" });
	sch.add("update", xp_sys.system, { phase: 7, name: "pr.xp" });
	sch.add("update", perks_sys.system, { phase: 8, name: "pr.perks" });
	sch.add("update", make_stats_recompute_system(), { phase: 9, name: "pr.stats_recompute" });

	if (opts.entity_graphics) {
		sch.add("render", make_entity_render_system(opts.entity_graphics), { phase: 10, name: "pr.entity_render" });
	}

	return { xp_sys, perks_sys };
};
