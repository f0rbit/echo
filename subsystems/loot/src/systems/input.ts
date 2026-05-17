import type { System } from "@f0rbit/forge";
import { dir_c, player_c } from "../components.ts";
import { inventory_ui_r } from "../resources.ts";

// input.ts — reads movement axes + the I (inventory_toggle) digital.
//
// Cell-step convention (per .plans/loot.md §2 Q1): set dir_c on the player
// every tick. movement.ts only fires every `step_every` ticks via the
// scheduler — so dir_c persists between movement attempts and the player
// keeps walking in the same direction until input changes.
//
// `restart` (R) is handled by restart.ts directly. We don't repeat the
// binding read here.

const sign = (n: number): -1 | 0 | 1 => (n > 0.3 ? 1 : n < -0.3 ? -1 : 0);

export const make_input_system = (): System => (w, ctx) => {
	const [ax, ay] = ctx.input.vector("move.x", "move.y");
	const dx = sign(ax);
	const dy = sign(ay);
	for (const [id] of w.query([player_c, dir_c] as const)) {
		w.set(id, dir_c, { dx, dy });
	}

	if (ctx.input.just("inventory_toggle")) {
		const ui = ctx.res.get(inventory_ui_r);
		if (ui.ok) ctx.res.set(inventory_ui_r, { ...ui.value, open: !ui.value.open });
	}
};
