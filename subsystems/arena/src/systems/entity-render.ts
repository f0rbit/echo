import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import type { Graphics } from "pixi.js";
import { chaser_c, dummy_c, hitbox_c, player_c, projectile_c, swing_c } from "../components.ts";
import { arena_r } from "../resources.ts";

const COLOR_BG = 0x16161e;
const COLOR_PLAYER = 0x7aa2f7;
const COLOR_DUMMY = 0xe0af68;
const COLOR_CHASER = 0xf7768e;
const COLOR_PROJECTILE = 0xc0caf5;
const COLOR_SWING = 0x9ece6a;
const SWING_ALPHA = 0.33;

/**
 * Render-stage system — draws all entities as filled Graphics shapes on a
 * single shared overlay added to `app.render.world` in main.ts.
 *
 * Rationale: Phase 3 plan §3 floated `__default__` coloured-square frames, but
 * Graphics matches the existing particle-overlay pattern, avoids any atlas
 * dependency, and renders at exact float `pos_c` coordinates — which preserves
 * continuous motion natively (no sub-pixel snapping). Read-only over the world;
 * never mutates entities.
 *
 * Phase ordering inside `render`: must run BEFORE `ar.light_update` (phase 99)
 * and `ar.camera_shake_apply` (phase 100) so the lighting filter samples the
 * already-drawn entities and the screen offset applies last. Phase 10 fits.
 *
 * Marker components (`player_c`, `dummy_c`, `chaser_c`) are elided from query
 * tuples — destructure to data-carrying slots only.
 */
export const make_entity_render_system = (graphics: Graphics): System =>
	(w, ctx) => {
		graphics.clear();

		const arena = ctx.res.get(arena_r);
		const width = arena.ok ? arena.value.width : 320;
		const height = arena.ok ? arena.value.height : 180;
		graphics.rect(0, 0, width, height).fill({ color: COLOR_BG });

		for (const [, pos, hb] of w.query([pos_c, hitbox_c, player_c] as const).collect()) {
			graphics.circle(pos.x, pos.y, hb.radius).fill({ color: COLOR_PLAYER });
		}

		for (const [, pos, hb] of w.query([pos_c, hitbox_c, dummy_c] as const).collect()) {
			graphics.circle(pos.x, pos.y, hb.radius).fill({ color: COLOR_DUMMY });
		}

		for (const [, pos, hb] of w.query([pos_c, hitbox_c, chaser_c] as const).collect()) {
			graphics.circle(pos.x, pos.y, hb.radius).fill({ color: COLOR_CHASER });
		}

		for (const [, pos, proj] of w.query([pos_c, projectile_c] as const).collect()) {
			graphics.circle(pos.x, pos.y, proj.radius).fill({ color: COLOR_PROJECTILE });
		}

		for (const [, pos, sw] of w.query([pos_c, swing_c] as const).collect()) {
			const center_angle = Math.atan2(sw.dir.y, sw.dir.x);
			const half = sw.arc_radians / 2;
			graphics
				.moveTo(pos.x, pos.y)
				.arc(pos.x, pos.y, sw.radius, center_angle - half, center_angle + half)
				.lineTo(pos.x, pos.y)
				.fill({ color: COLOR_SWING, alpha: SWING_ALPHA });
		}
	};
