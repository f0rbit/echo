import type { System } from "@f0rbit/forge";
import { exit_c, floor_c, player_c, wall_c } from "../components.ts";
import { regenerate_dungeon } from "./dungeon-gen.ts";

export const restart_system: System = (w, ctx) => {
	if (!ctx.input.just("restart")) return;
	for (const m of [floor_c, exit_c, player_c, wall_c]) w.despawn_marked(m);
	regenerate_dungeon(w, ctx);
};
