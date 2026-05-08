import type { Schedule, World } from "@f0rbit/forge";
import { arena_gen_system } from "./arena-gen.ts";
import { fov_system } from "./systems/fov.ts";
import { input_system } from "./systems/input.ts";
import { movement_system, step_every } from "./systems/movement.ts";
import { sprite_attach_system } from "./systems/sprite-attach.ts";

export const game_plugin = (_w: World, sch: Schedule): void => {
	sch.add("startup", arena_gen_system, "bst.gen");
	sch.add("update", input_system, "bst.input");
	sch.add("update", movement_system, { every: step_every, name: "bst.movement" });
	sch.add("post", sprite_attach_system, "bst.sprites");
	sch.add("post", fov_system, "bst.fov");
};
