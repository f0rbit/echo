// entity-render.ts — Graphics-based render (mirrors loot's entity-render
// and arena's). No atlas dep; background rect + player (blue circle) +
// chasers (red circles), all in design-coord space on app.render.world.
//
// Sprites draw at `visual_pos_c` (the tween target). Per loot Phase 4.7
// + bestiary's main.ts, the camera also follows visual_pos so player +
// camera move in lockstep through cell-step jumps.
import type { System } from "@f0rbit/forge";
import type { Graphics } from "pixi.js";
import { chaser_c, player_c, visual_pos_c } from "../components.ts";
import { arena_r } from "../resources.ts";

const COLOR_BG = 0x16161e;
const COLOR_PLAYER = 0x7aa2f7;
const COLOR_CHASER = 0xf7768e;
const PLAYER_RADIUS = 6;
const CHASER_RADIUS = 5;

export const make_entity_render_system = (graphics: Graphics): System => (w, ctx) => {
	graphics.clear();

	const arena = ctx.res.get(arena_r);
	const width = arena.ok ? arena.value.width : g_default_w;
	const height = arena.ok ? arena.value.height : g_default_h;
	graphics.rect(0, 0, width, height).fill({ color: COLOR_BG });

	for (const [, vp] of w.query([visual_pos_c, chaser_c] as const).collect()) {
		graphics.circle(vp.x, vp.y, CHASER_RADIUS).fill({ color: COLOR_CHASER });
	}

	for (const [, vp] of w.query([visual_pos_c, player_c] as const).collect()) {
		graphics.circle(vp.x, vp.y, PLAYER_RADIUS).fill({ color: COLOR_PLAYER });
	}
};

// Defensive defaults for the fraction-of-a-tick window before arena-gen
// runs (in tests or just-after-boot). Matches grid.ts: 30 cols × 20 rows × 16 px.
const g_default_w = 30 * 16;
const g_default_h = 20 * 16;
