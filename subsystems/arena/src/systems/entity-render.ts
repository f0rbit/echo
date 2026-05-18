import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import type { Graphics } from "pixi.js";
import { swing_c } from "../components.ts";

const COLOR_SWING = 0x9ece6a;
const SWING_ALPHA = 0.33;

export type EntityRenderTargets = {
	swing: Graphics;
};

/**
 * Render-stage system — draws the melee-swing arc on a Graphics overlay in
 * `app.render.world`. The host wires it with a zIndex above sprites so the
 * arc visually flashes over the player.
 *
 * Player / dummy / chaser / projectile / floor / wall entities are all real
 * pixel-art sprites from the 0x72 dungeon + walls-autotile atlases, attached
 * by `sprite_attach_system` (and `make_wall_autotile_system` for walls) and
 * rendered by forge's auto-installed `sprite_sync_system`. The swing arc is
 * the only thing left that can't be a sprite (depends on `swing_c.dir` angle
 * + `swing_c.radius`).
 *
 * Phase ordering inside `render`: must run BEFORE `ar.light_update` (phase 99)
 * and `ar.camera_shake_apply` (phase 100). Phase 10 fits.
 */
export const make_entity_render_system = (targets: EntityRenderTargets): System =>
	(w) => {
		targets.swing.clear();

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
