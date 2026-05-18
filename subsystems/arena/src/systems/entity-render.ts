import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import type { Graphics } from "pixi.js";
import { swing_c } from "../components.ts";
import { arena_r } from "../resources.ts";

const COLOR_BG = 0x16161e;
const COLOR_SWING = 0x9ece6a;
const SWING_ALPHA = 0.33;

export type EntityRenderTargets = {
	background: Graphics;
	swing: Graphics;
};

/**
 * Render-stage system — draws the arena background rect and the melee-swing
 * arc on two separate Graphics overlays in `app.render.world`. The host wires
 * the two overlays with different zIndex values so the background sits below
 * sprites and the swing arc above them.
 *
 * Player / dummy / chaser / projectile entities are now real pixel-art sprites
 * from the 0x72 dungeon atlas, attached by `sprite_attach_system` and rendered
 * by forge's auto-installed `sprite_sync_system`. Only the two things that
 * can't be a sprite live here:
 *
 *  - Arena background rect — needs the full design-coord extent.
 *  - Swing arc wedge — depends on `swing_c.dir` angle + `swing_c.radius`.
 *
 * Phase ordering inside `render`: must run BEFORE `ar.light_update` (phase 99)
 * and `ar.camera_shake_apply` (phase 100). Phase 10 fits.
 */
export const make_entity_render_system = (targets: EntityRenderTargets): System =>
	(w, ctx) => {
		targets.background.clear();
		targets.swing.clear();

		const arena = ctx.res.get(arena_r);
		const width = arena.ok ? arena.value.width : 320;
		const height = arena.ok ? arena.value.height : 180;
		targets.background.rect(0, 0, width, height).fill({ color: COLOR_BG });

		for (const [, pos, sw] of w.query([pos_c, swing_c] as const).collect()) {
			const center_angle = Math.atan2(sw.dir.y, sw.dir.x);
			const half = sw.arc_radians / 2;
			targets.swing
				.moveTo(pos.x, pos.y)
				.arc(pos.x, pos.y, sw.radius, center_angle - half, center_angle + half)
				.lineTo(pos.x, pos.y)
				.fill({ color: COLOR_SWING, alpha: SWING_ALPHA });
		}
	};
