import type { Schedule, System, World } from "@f0rbit/forge";
import { make_wall_autotile_system } from "@f0rbit/forge/autotile";
import type { Graphics } from "pixi.js";
import { wall_c } from "./components.ts";
import { g } from "./grid.ts";
import { make_arena_gen_system } from "./arena-gen.ts";
import { hit_events_r } from "./resources.ts";
import { chaser_think_system } from "./systems/ai-chaser.ts";
import { make_camera_shake_push_system } from "./systems/camera-shake.ts";
import { make_contact_damage_system } from "./systems/contact-damage.ts";
import { creature_occupancy_system } from "./systems/creature-occupancy.ts";
import { make_enemy_spawn_system } from "./systems/enemy-spawn.ts";
import { make_entity_render_system } from "./systems/entity-render.ts";
import { make_flash_system } from "./systems/flash.ts";
import { make_hitstop_release_system, make_hitstop_trigger_system } from "./systems/hitstop.ts";
import { make_input_system } from "./systems/input.ts";
import { make_melee_swing_system } from "./systems/melee-swing.ts";
import { movement_system, step_every } from "./systems/movement.ts";
import {
	make_particles_advance_system,
	make_particles_emit_system,
	make_particles_render_system,
} from "./systems/particles.ts";
import { path_step_system } from "./systems/path-step.ts";
import { make_perks_system, type PerksSystem } from "./systems/perks.ts";
import { make_restart_system } from "./systems/restart.ts";
import { sprite_attach_system } from "./systems/sprite-attach.ts";
import { make_stats_recompute_system } from "./systems/stats.ts";
import { make_synthetic_perk_pick_system } from "./systems/synthetic-perk-pick.ts";
import { tween_step_system } from "./systems/tween.ts";
import { make_xp_system, type XpSystem } from "./systems/xp.ts";

// plugin.ts — wires the schedule for Phase 5.3.
//
// Stage ordering (per .plans/progress.md §5 Phase 5.3 + loot's pattern):
//   startup → arena_gen
//   pre     → restart, creature_occupancy
//   update  → input → movement (every step_every) → tween → ai_chaser →
//             path_step (every step_every) → enemy_spawn → melee_swing →
//             contact_damage → xp → perks → stats_recompute
//
// contact_damage runs AFTER melee_swing so the player wins on a tick
// where they swing at an adjacent chaser — the chaser is already
// despawned by melee, contact_damage's query yields nothing.
//   post    → sprite_attach (writes sprite_c once per marker; forge's
//             auto-installed sprite_sync_system reads it)
//   render  → entity_render (background rect only; if a Graphics handle was
//             passed in)
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
	particles_overlay?: Graphics;
	xp_system?: XpSystem;
	perks_system?: PerksSystem;
};

export type GamePluginExports = {
	xp_sys: XpSystem;
	perks_sys: PerksSystem;
};

// Clears hit_events_r at the start of each tick so per-tick juice
// (flash, hitstop trigger, camera-shake push, particles emit) reads a
// fresh slate. Mirrors arena's `clear_hit_events_system`.
const clear_hit_events_system: System = (_w, ctx) => {
	const r = ctx.res.get(hit_events_r);
	if (r.ok) r.value.events = [];
};

export const game_plugin = (_w: World, sch: Schedule, opts: GamePluginOpts = {}): GamePluginExports => {
	const xp_sys = opts.xp_system ?? make_xp_system();
	const perks_sys = opts.perks_system ?? make_perks_system();

	sch.add("startup", make_arena_gen_system(), { name: "pr.arena_gen" });

	sch.add("pre", make_restart_system(), { phase: 0, name: "pr.restart" });
	sch.add("pre", make_wall_autotile_system({ wall_c, texture: "walls", grid: g }), { phase: 1, name: "pr.wall_autotile" });
	sch.add("pre", creature_occupancy_system, { phase: 2, name: "pr.creature_occupancy" });
	// Clear hit_events BEFORE gameplay systems write to it this tick; the
	// release MUST run regardless of paused/dead state (FRICTION/arena §1).
	sch.add("pre", clear_hit_events_system, { phase: 3, name: "pr.hit_events_clear" });
	sch.add("pre", make_hitstop_release_system(), { phase: 4, name: "pr.hitstop_release" });

	sch.add("update", make_input_system(perks_sys), { phase: 0, name: "pr.input" });
	sch.add("update", movement_system, { every: step_every, phase: 1, name: "pr.movement" });
	sch.add("update", tween_step_system, { phase: 2, name: "pr.tween" });
	sch.add("update", chaser_think_system, { every: AI_TICK_EVERY, phase: 3, name: "pr.ai_chaser" });
	sch.add("update", path_step_system, { every: step_every, phase: 4, name: "pr.path_step" });
	sch.add("update", make_enemy_spawn_system(), { phase: 5, name: "pr.enemy_spawn" });
	sch.add("update", make_melee_swing_system(xp_sys), { phase: 6, name: "pr.melee_swing" });
	sch.add("update", make_contact_damage_system(), { phase: 6.5, name: "pr.contact_damage" });
	sch.add("update", xp_sys.system, { phase: 7, name: "pr.xp" });
	// Synthetic perk-pick drains replay-recorded `pick_perk_0..2` action
	// edges into the same queue the DOM pointer handler writes to; runs
	// BEFORE perks.system so queued picks are consumed on the same tick
	// (mirrors loot's synthetic-slot-click at phase 2.5 before inventory).
	sch.add("update", make_synthetic_perk_pick_system(perks_sys.queue_perk_pick), { phase: 7.5, name: "pr.synthetic_perk_pick" });
	sch.add("update", perks_sys.system, { phase: 8, name: "pr.perks" });
	sch.add("update", make_stats_recompute_system(), { phase: 9, name: "pr.stats_recompute" });
	// Juice phase — runs AFTER gameplay so hit_events emitted by
	// melee-swing + contact-damage are visible. Order mirrors arena's
	// (push → trigger → advance → emit → flash) so the cell-step copy
	// behaves identically.
	sch.add("update", make_camera_shake_push_system(), { phase: 20, name: "pr.camera_shake_push" });
	sch.add("update", make_hitstop_trigger_system(), { phase: 21, name: "pr.hitstop_trigger" });
	sch.add("update", make_particles_advance_system(), { phase: 22, name: "pr.particles_advance" });
	sch.add("update", make_particles_emit_system(), { phase: 23, name: "pr.particles_emit" });
	sch.add("update", make_flash_system(), { phase: 24, name: "pr.flash" });

	sch.add("post", sprite_attach_system, { phase: 0, name: "pr.sprite_attach" });

	if (opts.entity_graphics) {
		sch.add("render", make_entity_render_system(opts.entity_graphics), { phase: 10, name: "pr.entity_render" });
	}
	if (opts.particles_overlay) {
		sch.add("post", make_particles_render_system(opts.particles_overlay), { phase: 50, name: "pr.particles_render" });
	}

	return { xp_sys, perks_sys };
};
