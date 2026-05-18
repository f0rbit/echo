// entity-render.ts — render-stage background rect. Player + chaser entities
// are now real pixel-art sprites from the 0x72 dungeon atlas, attached by
// `sprite_attach_system` and rendered by forge's auto-installed
// `sprite_sync_system`. Only the background — which needs the full
// design-coord extent — remains a Graphics fill here.
import type { System } from "@f0rbit/forge";
import type { Graphics } from "pixi.js";
import { arena_r } from "../resources.ts";

const COLOR_BG = 0x16161e;

export const make_entity_render_system = (graphics: Graphics): System => (_w, ctx) => {
	graphics.clear();

	const arena = ctx.res.get(arena_r);
	const width = arena.ok ? arena.value.width : g_default_w;
	const height = arena.ok ? arena.value.height : g_default_h;
	graphics.rect(0, 0, width, height).fill({ color: COLOR_BG });
};

// Defensive defaults for the fraction-of-a-tick window before arena-gen
// runs (in tests or just-after-boot). Matches grid.ts: 30 cols × 20 rows × 16 px.
const g_default_w = 30 * 16;
const g_default_h = 20 * 16;
