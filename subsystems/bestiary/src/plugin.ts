import type { Schedule, World } from "@f0rbit/forge";
import { arena_gen_system } from "./arena-gen.ts";
import { chaser_think_system } from "./systems/ai/chaser.ts";
import { path_step_system } from "./systems/ai/path-step.ts";
import { patroller_think_system } from "./systems/ai/patroller.ts";
import { fov_system } from "./systems/fov.ts";
import { input_system } from "./systems/input.ts";
import { movement_system, step_every } from "./systems/movement.ts";
import { sprite_attach_system } from "./systems/sprite-attach.ts";

const ai_tick = 12;

export const game_plugin = (_w: World, sch: Schedule): void => {
	sch.add("startup", arena_gen_system, "bst.gen");
	sch.add("update", input_system, "bst.input");
	sch.add("update", movement_system, { every: step_every, name: "bst.movement" });
	sch.add("update", chaser_think_system, { every: ai_tick, phase: 0, name: "bst.ai_chaser_think" });
	sch.add("update", patroller_think_system, { every: ai_tick, phase: 1, name: "bst.ai_patroller_think" });
	sch.add("update", path_step_system, { every: step_every, name: "bst.ai_path_step" });
	sch.add("post", sprite_attach_system, "bst.sprites");
	sch.add("post", fov_system, "bst.fov");
};
