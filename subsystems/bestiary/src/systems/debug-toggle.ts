import type { System } from "@f0rbit/forge";
import { debug_visible_r } from "../resources.ts";

export const debug_toggle_system: System = (_w, ctx) => {
	if (!ctx.input.just("debug_toggle")) return;
	const cur = ctx.res.get(debug_visible_r);
	const on = cur.ok ? cur.value.on : false;
	ctx.res.set(debug_visible_r, { on: !on });
};
