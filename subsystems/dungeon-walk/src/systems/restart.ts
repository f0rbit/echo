import type { System } from "@f0rbit/forge";
import { exit_c, floor_c, player_c } from "../components.ts";
import { regenerate_dungeon } from "./dungeon-gen.ts";

export const restart_system: System = (w, ctx) => {
	if (!ctx.input.just("restart")) return;
	w.despawn_marked(floor_c);
	w.despawn_marked(exit_c);
	w.despawn_marked(player_c);
	regenerate_dungeon(w, ctx);
};
