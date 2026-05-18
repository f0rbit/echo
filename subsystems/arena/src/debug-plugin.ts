import type { Ctx, Schedule, System, World } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import type { Container, Graphics } from "pixi.js";
import type { LightSystem } from "@f0rbit/forge/light";
import { dummy_c, dir_vec_c, health_c, hitbox_c, player_c, vel_c, weapon_c } from "./components.ts";
import { g } from "./grid.ts";
import {
	arena_r,
	camera_shake_r,
	hit_events_r,
	hitstop_r,
	particles_r,
	run_seed_r,
	wave_r,
} from "./resources.ts";
import { make_combat_melee_system } from "./systems/combat-melee.ts";
import { make_combat_ranged_system } from "./systems/combat-ranged.ts";
import { make_debug_auto_fire_system } from "./systems/debug-auto-fire.ts";
import { make_debug_overlay_system } from "./systems/debug-overlay.ts";
import { make_flash_system } from "./systems/flash.ts";
import { make_hitstop_release_system, make_hitstop_trigger_system } from "./systems/hitstop.ts";
import { make_camera_shake_push_system } from "./systems/camera-shake.ts";
import { make_light_fx_system } from "./systems/light-fx.ts";
import {
	make_particles_advance_system,
	make_particles_emit_system,
	make_particles_render_system,
} from "./systems/particles.ts";
import { sprite_attach_system } from "./systems/sprite-attach.ts";

export type DebugPluginOpts = {
	light?: LightSystem;
	particles_overlay?: Graphics;
	debug_container: Container;
};

const PLAYER_SPAWN = { x: 160, y: 90 };
const DUMMY_POSITIONS: ReadonlyArray<{ x: number; y: number }> = [
	{ x: 80, y: 60 },
	{ x: 160, y: 60 },
	{ x: 240, y: 60 },
];
const PARTICLE_CAPACITY = 256;
const DESIGN_WIDTH = g.cols * g.tile;
const DESIGN_HEIGHT = g.rows * g.tile;

const setup_debug_arena = (w: World, ctx: Ctx): void => {
	ctx.res.set(arena_r, {
		cols: g.cols,
		rows: g.rows,
		width: DESIGN_WIDTH,
		height: DESIGN_HEIGHT,
	});
	ctx.res.set(wave_r, { current: 0, total: 0, chasers_alive: 0, total_kills: 0 });
	ctx.res.set(hitstop_r, { remaining: 0 });
	ctx.res.set(camera_shake_r, { magnitude: 0, decay: 0 });
	ctx.res.set(run_seed_r, { base: ctx.rng.seed, restart_count: 0 });
	ctx.res.set(hit_events_r, { events: [] });
	ctx.res.set(particles_r, {
		entries: Array.from({ length: PARTICLE_CAPACITY }, () => ({
			x: 0, y: 0, vx: 0, vy: 0, ttl: 0, max_ttl: 0, color: 0, size: 0,
		})),
		head: 0,
		capacity: PARTICLE_CAPACITY,
	});

	w.spawn(
		[player_c, true],
		[pos_c, { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y }],
		[dir_vec_c, { x: 1, y: 0 }],
		[vel_c, { x: 0, y: 0 }],
		[health_c, { current: 999, max: 999 }],
		[weapon_c, {
			melee_cooldown: 20,
			ranged_cooldown: 12,
			melee_ready_in: 0,
			ranged_ready_in: 0,
		}],
		[hitbox_c, { radius: 4 }],
	);

	for (const dp of DUMMY_POSITIONS) {
		w.spawn(
			[dummy_c, true],
			[pos_c, { x: dp.x, y: dp.y }],
			[health_c, { current: 999_999, max: 999_999 }],
			[hitbox_c, { radius: 6 }],
		);
	}
};

const clear_hit_events_system: System = (_w, ctx) => {
	const r = ctx.res.get(hit_events_r);
	if (r.ok) r.value.events = [];
};

/**
 * Debug plugin — stripped game loop for visual juice verification.
 *
 * No input, no movement, no enemy AI, no waves, no restart. Just three
 * stationary target dummies + an auto-fire system that exercises melee +
 * ranged on a deterministic schedule (60 / 90 ticks). The combat / hitstop /
 * shake / flash / particles / light-fx systems are wired in unchanged so any
 * regression in those systems shows up here visually.
 *
 * Phase ordering mirrors `plugin.ts` minus production-only systems. The auto-
 * fire system runs at the same `update.phase=0` slot as production's input
 * system — it IS the input analog.
 */
export const debug_plugin = (_w: World, sch: Schedule, opts: DebugPluginOpts): void => {
	sch.add("startup", (w, ctx) => setup_debug_arena(w, ctx), "ar.debug.setup");

	sch.add("pre", clear_hit_events_system, { phase: 0, name: "ar.hit_events_clear" });
	sch.add("pre", make_hitstop_release_system(), { phase: 2, name: "ar.hitstop_release" });

	sch.add("update", make_debug_auto_fire_system(), { phase: 0, name: "ar.debug_auto_fire" });
	sch.add("update", make_combat_melee_system(), { phase: 2, name: "ar.combat_melee" });
	sch.add("update", make_combat_ranged_system(), { phase: 3, name: "ar.combat_ranged" });
	sch.add("update", make_camera_shake_push_system(), { phase: 6, name: "ar.camera_shake_push" });
	sch.add("update", make_hitstop_trigger_system(), { phase: 7, name: "ar.hitstop_trigger" });
	sch.add("update", make_particles_advance_system(), { phase: 8, name: "ar.particles_advance" });
	sch.add("update", make_particles_emit_system(), { phase: 9, name: "ar.particles_emit" });
	sch.add("update", make_flash_system(), { phase: 10, name: "ar.flash" });
	if (opts.light) {
		sch.add("update", make_light_fx_system(opts.light), { phase: 11, name: "ar.light_fx" });
	}

	sch.add("post", sprite_attach_system, { phase: 0, name: "ar.sprite_attach" });

	if (opts.particles_overlay) {
		sch.add("post", make_particles_render_system(opts.particles_overlay), { name: "ar.particles_render" });
	}

	sch.add("post", make_debug_overlay_system(opts.debug_container), { phase: 100, name: "ar.debug_overlay" });
};
