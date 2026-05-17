import type { System } from "@f0rbit/forge";
import type { Graphics } from "pixi.js";
import { pickup_c, player_c, visual_pos_c } from "../components.ts";
import { arena_r, item_registry_r } from "../resources.ts";
import type { ItemDef, ItemId } from "../data/items.ts";

// entity-render.ts — Option A: Graphics-based render (mirrors arena's
// systems/entity-render.ts). No atlas dep; circles for player + pickups,
// dark rect for the background. Pickups are tinted by their ItemDef.color.
//
// Pixi `pos` boot uses visual_pos_c so the camera follows the lerped value
// (per .plans/loot.md §2 Q1 + bestiary's main.ts). For consistency, sprites
// also draw at visual_pos_c — otherwise the player would jump between
// cells while the camera lerped, which looks broken.

const COLOR_BG = 0x16161e;
const COLOR_PLAYER = 0x7aa2f7;
const PLAYER_RADIUS = 6;
const PICKUP_RADIUS = 4;

export const make_entity_render_system = (graphics: Graphics): System => (w, ctx) => {
	graphics.clear();

	const arena = ctx.res.get(arena_r);
	const width = arena.ok ? arena.value.width : 320;
	const height = arena.ok ? arena.value.height : 180;
	graphics.rect(0, 0, width, height).fill({ color: COLOR_BG });

	const reg = ctx.res.get(item_registry_r);
	const items = reg.ok ? reg.value.items : null;

	for (const [, vp, pickup] of w.query([visual_pos_c, pickup_c] as const).collect()) {
		const def = items ? ((items.get(pickup.item_id as ItemId) ?? null) as ItemDef | null) : null;
		const color = def?.color ?? 0xffffff;
		graphics.circle(vp.x, vp.y, PICKUP_RADIUS).fill({ color });
	}

	for (const [, vp] of w.query([visual_pos_c, player_c] as const).collect()) {
		graphics.circle(vp.x, vp.y, PLAYER_RADIUS).fill({ color: COLOR_PLAYER });
	}
};
