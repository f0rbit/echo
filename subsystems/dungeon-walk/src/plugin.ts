import type { Schedule, System, World } from "@f0rbit/forge";
import { score_r, win_overlay_r } from "./resources.ts";
import { dungeon_gen_system } from "./systems/dungeon-gen.ts";
import { input_system } from "./systems/input.ts";
import { type LightSystem, make_eye_follow_system, make_light_update_system } from "@f0rbit/forge/light";
import { movement_system, step_every } from "./systems/movement.ts";
import { restart_system } from "./systems/restart.ts";
import { sprite_attach_system } from "./systems/sprite-attach.ts";
import { tween_step_system } from "./systems/tween.ts";
import { wall_autotile_system } from "./systems/wall-autotile.ts";
import { wall_index_system } from "./systems/wall-index.ts";
import { player_c, visual_pos_c } from "./components.ts";
import { g } from "./grid.ts";
import { wall_index_r } from "./resources.ts";

const win_overlay_system: System = (_w, ctx) => {
	const score = ctx.res.get(score_r);
	const overlay = ctx.res.get(win_overlay_r);
	if (!score.ok || !overlay.ok) return;
	overlay.value.show(score.value.reached_exit);
};

export type GamePluginOpts = {
	light?: LightSystem;
};

export const game_plugin = (_w: World, sch: Schedule, opts: GamePluginOpts = {}): void => {
	sch.add("startup", dungeon_gen_system, "dw.gen");
	sch.add("startup", wall_autotile_system, "dw.wall_autotile");
	sch.add("pre", restart_system, "dw.restart");
	sch.add("pre", wall_index_system, "dw.wall_index");
	sch.add("update", input_system, "dw.input");
	sch.add("update", movement_system, { every: step_every, name: "dw.movement" });
	sch.add("post", sprite_attach_system, "dw.sprites");
	sch.add("post", tween_step_system, "dw.tween");
	if (opts.light) {
		sch.add("post", make_eye_follow_system(opts.light, g, visual_pos_c, player_c), "dw.eye_follow");
	}
	if (opts.light) {
		sch.add("render", make_light_update_system(opts.light, (_w, ctx) => {
			const r = ctx.res.get(wall_index_r);
			if (!r.ok) return null;
			const walls = r.value.cells;
			return (cell: { x: number; y: number }) => walls.has(g.key(cell.x, cell.y));
		}), "dw.light_update");
	}
	sch.add("render", win_overlay_system, "dw.win");
};
