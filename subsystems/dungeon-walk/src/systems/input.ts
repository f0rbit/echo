import type { System } from "@f0rbit/forge";
import { dir_c, player_c } from "../components.ts";

const sign = (n: number): -1 | 0 | 1 => (n > 0.3 ? 1 : n < -0.3 ? -1 : 0);

export const input_system: System = (w, ctx) => {
	const [ax, ay] = ctx.input.vector("move.x", "move.y");
	const dx = sign(ax);
	const dy = sign(ay);
	for (const [id] of w.query([player_c, dir_c] as const)) {
		w.set(id, dir_c, { dx, dy });
	}
};
