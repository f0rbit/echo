import type { Schedule, System, World } from "@f0rbit/forge";
import type { Graphics } from "pixi.js";
import type { LightSystem } from "@f0rbit/forge/light";
import { make_arena_gen } from "./arena-gen.ts";
import { make_input_system } from "./systems/input.ts";
import { make_movement_system } from "./systems/movement.ts";
import { make_combat_melee_system } from "./systems/combat-melee.ts";
import { make_combat_ranged_system } from "./systems/combat-ranged.ts";
import { make_enemy_ai_system } from "./systems/enemy-ai.ts";
import { make_waves_system } from "./systems/waves.ts";
import { make_restart_system } from "./systems/restart.ts";
import { make_hitstop_release_system, make_hitstop_trigger_system } from "./systems/hitstop.ts";
import { make_camera_shake_push_system } from "./systems/camera-shake.ts";
import { make_flash_system } from "./systems/flash.ts";
import { make_light_fx_system } from "./systems/light-fx.ts";
import {
	make_particles_advance_system,
	make_particles_emit_system,
	make_particles_render_system,
} from "./systems/particles.ts";
import { hit_events_r } from "./resources.ts";

export type GamePluginOpts = {
	light?: LightSystem;
	particles_overlay?: Graphics;
};

// Clears hit_events_r at the start of each tick so per-tick hit events are
// fresh. Downstream juice (flash, hitstop, shake, particles) reads these
// events in `update`/`post`.
const clear_hit_events_system: System = (_w, ctx) => {
	const r = ctx.res.get(hit_events_r);
	if (r.ok) r.value.events = [];
};

export const game_plugin = (_w: World, sch: Schedule, opts: GamePluginOpts = {}): void => {
	sch.add("startup", make_arena_gen(), "ar.setup_arena");

	sch.add("pre", clear_hit_events_system, { phase: 0, name: "ar.hit_events_clear" });
	sch.add("pre", make_restart_system(), { phase: 1, name: "ar.restart" });
	sch.add("pre", make_hitstop_release_system(), { phase: 2, name: "ar.hitstop_release" });

	sch.add("update", make_input_system(), { phase: 0, name: "ar.input" });
	sch.add("update", make_movement_system(), { phase: 1, name: "ar.movement" });
	sch.add("update", make_combat_melee_system(), { phase: 2, name: "ar.combat_melee" });
	sch.add("update", make_combat_ranged_system(), { phase: 3, name: "ar.combat_ranged" });
	sch.add("update", make_enemy_ai_system(), { phase: 4, name: "ar.enemy_ai" });
	sch.add("update", make_waves_system(), { phase: 5, name: "ar.waves" });
	sch.add("update", make_camera_shake_push_system(), { phase: 6, name: "ar.camera_shake_push" });
	sch.add("update", make_hitstop_trigger_system(), { phase: 7, name: "ar.hitstop_trigger" });
	sch.add("update", make_particles_advance_system(), { phase: 8, name: "ar.particles_advance" });
	sch.add("update", make_particles_emit_system(), { phase: 9, name: "ar.particles_emit" });
	sch.add("update", make_flash_system(), { phase: 10, name: "ar.flash" });
	if (opts.light) {
		sch.add("update", make_light_fx_system(opts.light), { phase: 11, name: "ar.light_fx" });
	}

	if (opts.particles_overlay) {
		sch.add("post", make_particles_render_system(opts.particles_overlay), { name: "ar.particles_render" });
	}
};
