import type { Component, System, World } from "@f0rbit/forge";
import { exit_c, floor_c, player_c } from "../components.ts";
import { regenerate_dungeon } from "./dungeon-gen.ts";

const despawn_with = (w: World, c: Component<unknown>): void => {
	for (const [id] of w.query([c] as const).collect()) w.despawn(id);
};

export const restart_system: System = (w, ctx) => {
	if (!ctx.input.just("restart")) return;
	despawn_with(w, floor_c);
	despawn_with(w, exit_c);
	despawn_with(w, player_c);
	regenerate_dungeon(w, ctx);
};
