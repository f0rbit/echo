import type { Container } from "pixi.js";
import type { Schedule, World } from "@f0rbit/forge";
import type { Camera } from "@f0rbit/forge/pixi";
import { debug_arena_gen_system } from "./systems/debug-arena-gen.ts";
import { sprite_attach_system } from "./systems/sprite-attach.ts";
import { make_wall_autotile_system } from "@f0rbit/forge/autotile";
import { wall_c } from "./components.ts";
import { g } from "./grid.ts";
import { wall_index_system } from "./systems/wall-index.ts";
import { make_wall_debug_system } from "./systems/wall-debug.ts";

export type DebugPluginOpts = {
	world_container: Container;
	debug_container: Container;
	camera: Camera;
};

export const debug_plugin = (_w: World, sch: Schedule, opts: DebugPluginOpts): void => {
	sch.add("startup", debug_arena_gen_system, "dw.debug_gen");
	sch.add("startup", make_wall_autotile_system({ wall_c, texture: "walls", grid: g }), "dw.wall_autotile");
	sch.add("startup", make_wall_debug_system(opts.world_container, opts.debug_container, opts.camera), "dw.wall_debug");
	sch.add("pre", wall_index_system, "dw.wall_index");
	sch.add("post", sprite_attach_system, "dw.sprites");
};
