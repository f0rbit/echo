import type { Schedule, System, World } from "@f0rbit/forge";
import { arena_gen_system } from "./arena-gen.ts";
import { chaser_think_system } from "./systems/ai/chaser.ts";
import { path_step_system } from "./systems/ai/path-step.ts";
import { patroller_think_system } from "./systems/ai/patroller.ts";
import {
	projectile_step_system,
	ranged_think_system,
	telegraph_tick_system,
} from "./systems/ai/ranged.ts";
import { summoner_spawn_system } from "./systems/ai/summoner.ts";
import { fov_system } from "./systems/fov.ts";
import { input_system } from "./systems/input.ts";
import { movement_system, step_every } from "./systems/movement.ts";
import { sprite_attach_system } from "./systems/sprite-attach.ts";

const ai_tick = 12;
const projectile_step_every = 3;

export type GamePluginOpts = {
	telegraph_render?: System;
};

export const game_plugin = (_w: World, sch: Schedule, opts: GamePluginOpts = {}): void => {
	sch.add("startup", arena_gen_system, "bst.gen");
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
	sch.add("post", fov_system, "bst.fov");
	if (opts.telegraph_render) sch.add("post", opts.telegraph_render, "bst.telegraph_render");
};
