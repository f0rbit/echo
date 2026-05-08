import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import type { Grid } from "@f0rbit/forge/grid";
import { Container, Graphics } from "pixi.js";
import { projectile_c, telegraph_c } from "../components.ts";

const telegraph_total = 30;

export const make_telegraph_render = (parent: Container, gr: Grid): System => {
	const gfx = new Graphics();
	gfx.zIndex = 1000;
	parent.addChild(gfx);
	const half = gr.tile / 2;

	return w => {
		gfx.clear();

		for (const [, tg] of w.query([telegraph_c] as const).collect()) {
			const a = gr.cell_to_world(tg.from.x, tg.from.y);
			const b = gr.cell_to_world(tg.to.x, tg.to.y);
			const alpha = 1 - tg.ticks_left / telegraph_total;
			gfx.moveTo(a.x + half, a.y + half);
			gfx.lineTo(b.x + half, b.y + half);
			gfx.stroke({ width: 1, color: 0xff0000, alpha });
		}

		for (const [, p] of w.query([pos_c, projectile_c] as const).collect()) {
			gfx.rect(p.x + half - 2, p.y + half - 2, 4, 4);
			gfx.fill({ color: 0xff0000 });
		}
	};
};
