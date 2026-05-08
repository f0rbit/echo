import type { System } from "@f0rbit/forge";
import { regenerate_arena } from "../arena-gen.ts";
import { arena_r } from "../resources.ts";

export const restart_system: System = (w, ctx) => {
	if (!ctx.input.just("restart")) return;
	w.clear();
	if (ctx.res.has(arena_r)) ctx.res.remove(arena_r);
	regenerate_arena(w, ctx);
};
