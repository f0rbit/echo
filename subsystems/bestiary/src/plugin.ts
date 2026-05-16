import type { Schedule, System, World } from "@f0rbit/forge";
import { arena_gen_system } from "./arena-gen.ts";
import { player_c, summoner_c, visual_pos_c } from "./components.ts";
import { g } from "./grid.ts";
import { arena_r } from "./resources.ts";
import { chaser_think_system } from "./systems/ai/chaser.ts";
import { path_step_system } from "./systems/ai/path-step.ts";
import { patroller_think_system } from "./systems/ai/patroller.ts";
import {
	projectile_step_system,
	ranged_think_system,
	telegraph_tick_system,
} from "./systems/ai/ranged.ts";
import { summoner_spawn_system } from "./systems/ai/summoner.ts";
import { debug_toggle_system } from "./systems/debug-toggle.ts";
import { creature_occupancy_system } from "./systems/creature-occupancy.ts";
import { input_system } from "./systems/input.ts";
import {
	type LightHandle,
	type LightSystem,
	make_eye_follow_system,
	make_light_update_system,
	make_marker_light_follow_system,
} from "@f0rbit/forge/light";
import { movement_system, step_every } from "./systems/movement.ts";
import { restart_system } from "./systems/restart.ts";
import { sprite_attach_system } from "./systems/sprite-attach.ts";
import { tween_step_system } from "./systems/tween.ts";

const ai_tick = 12;
const projectile_step_every = 3;

export type GamePluginOpts = {
	telegraph_render?: System;
	debug_overlay?: System;
	light?: LightSystem;
	summoner_glow?: LightHandle;
};

export const game_plugin = (_w: World, sch: Schedule, opts: GamePluginOpts = {}): void => {
	sch.add("startup", arena_gen_system, "bst.gen");
	sch.add("pre", restart_system, "bst.restart");
	sch.add("pre", debug_toggle_system, "bst.debug_toggle");
	sch.add("pre", creature_occupancy_system, "bst.creature_occupancy");
	sch.add("update", input_system, "bst.input");
	sch.add("update", movement_system, { every: step_every, name: "bst.movement" });
	sch.add("update", chaser_think_system, { every: ai_tick, phase: 0, name: "bst.ai_chaser_think" });
	sch.add("update", patroller_think_system, { every: ai_tick, phase: 1, name: "bst.ai_patroller_think" });
	sch.add("update", ranged_think_system, { every: ai_tick, phase: 2, name: "bst.ai_ranged_think" });
	sch.add("update", summoner_spawn_system, { every: ai_tick, phase: 3, name: "bst.ai_summoner_spawn" });
	sch.add("update", telegraph_tick_system, "bst.ai_telegraph_tick");
	sch.add("update", path_step_system, { every: step_every, name: "bst.ai_path_step" });
	sch.add("update", projectile_step_system, { every: projectile_step_every, name: "bst.ai_projectile_step" });
	sch.add("post", sprite_attach_system, "bst.sprites");
	sch.add("post", tween_step_system, "bst.tween");
	if (opts.light) {
		sch.add("post", make_eye_follow_system(opts.light, g, visual_pos_c, player_c), "bst.light_eye_follow");
	}
	if (opts.light && opts.summoner_glow) {
		sch.add(
			"post",
			make_marker_light_follow_system(opts.light, g, opts.summoner_glow, summoner_c, visual_pos_c),
			"bst.light_follow_summoner",
		);
	}
	if (opts.light) {
		sch.add("render", make_light_update_system(opts.light, (_w, ctx) => {
			const r = ctx.res.get(arena_r);
			if (!r.ok) return null;
			const floors = r.value.floors;
			return cell => !floors.has(g.key(cell.x, cell.y));
		}), "bst.light_update");
	}
	if (opts.telegraph_render) sch.add("post", opts.telegraph_render, "bst.telegraph_render");
	if (opts.debug_overlay) sch.add("post", opts.debug_overlay, "bst.debug_overlay");
};
