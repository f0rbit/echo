import type { Schedule, System, World } from "@f0rbit/forge";
import { score_r, win_overlay_r } from "./resources.ts";
import { dungeon_gen_system } from "./systems/dungeon-gen.ts";
import { fov_system } from "./systems/fov.ts";
import { input_system } from "./systems/input.ts";
import { movement_system, step_every } from "./systems/movement.ts";
import { restart_system } from "./systems/restart.ts";
import { sprite_attach_system } from "./systems/sprite-attach.ts";

const win_overlay_system: System = (_w, ctx) => {
	const score = ctx.res.get(score_r);
	const overlay = ctx.res.get(win_overlay_r);
	if (!score.ok || !overlay.ok) return;
	overlay.value.show(score.value.reached_exit);
};

export const game_plugin = (_w: World, sch: Schedule): void => {
	sch.add("startup", dungeon_gen_system, "dw.gen");
	sch.add("pre", restart_system, "dw.restart");
	sch.add("update", input_system, "dw.input");
	sch.add_periodic("update", movement_system, { every: step_every }, "dw.movement");
	sch.add("post", sprite_attach_system, "dw.sprites");
	sch.add("post", fov_system, "dw.fov");
	sch.add("render", win_overlay_system, "dw.win");
};
