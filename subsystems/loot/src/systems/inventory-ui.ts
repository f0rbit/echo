import type { System } from "@f0rbit/forge";
import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { event_to_world, type Assets, type Camera } from "@f0rbit/forge/pixi";
import type { Equipment, Inventory } from "../components.ts";
import type { ItemDef, ItemId, ItemRegistry } from "../data/items.ts";
import { g } from "../grid.ts";

// inventory-ui.ts — modal inventory overlay on app.stage (sibling of
// surface_sprite, below palette_overlay) per .plans/loot.md §2 Q4. Renders a
// 4×3 grid of 12 slots, each showing the item's atlas sprite frame on a dark
// backdrop. Hidden unless inventory_ui_r.open.
//
// DOM pointerdown handler: event_to_world (forge handles DPR + RenderTexture
// math per echo AGENTS.md "Canvas → world coords") → design-coord slot_at hit
// test → opts.on_slot_click(idx). NEVER reimplement fit_scale.
//
// Per-slot sprite layer: lazy-init one Sprite per slot at first redraw,
// cached in `slot_sprites[]`. Frames are 16×16; slots are 24×24 so we render
// at 1:1 and center via anchor 0.5. Empty slots toggle visibility off.
//
// Crisp text: `resolution: 4` + `text.scale.set(0.5)` — parent is `app.stage`
// modal mirroring `surface_sprite` (i.e. container is scaled to design-space
// → window). Glyph rendered at 4× DPI then halved keeps the cache texture
// from being upscaled by Pixi v8. See AGENTS.md "Crisp text recipe".

const DESIGN_W = g.cols * g.tile;
const DESIGN_H = g.rows * g.tile;

const SLOT_SIZE = 24;
const SLOT_GAP = 4;
const COLS = 4;
const ROWS = 3;
const SLOT_COUNT = COLS * ROWS;

const GRID_W = COLS * SLOT_SIZE + (COLS - 1) * SLOT_GAP;
const GRID_H = ROWS * SLOT_SIZE + (ROWS - 1) * SLOT_GAP;
const GRID_X = Math.round((DESIGN_W - GRID_W) / 2);
const GRID_Y = Math.round((DESIGN_H - GRID_H) / 2);

const COLOR_BACKDROP = 0x000000;
const BACKDROP_ALPHA = 0.5;
const COLOR_EMPTY = 0x202028;
const COLOR_BORDER = 0x4a4a55;
const COLOR_BORDER_EQUIPPED = 0x6affa0;
const COLOR_BORDER_SELECTED = 0xffd24a;
const COLOR_INFO_BG = 0x14141c;
const COLOR_INFO_TEXT = 0xffffff;

const INFO_W = 84;
const INFO_PAD = 4;
const INFO_X = GRID_X + GRID_W + 6;
const INFO_Y = GRID_Y;

// fontSize doubled vs. design (7 → 14) because Text gets `scale.set(0.5)` —
// crisp-text recipe renders the glyph cache at 4× DPI then halves display.
// Visible size = 14 × 0.5 = 7 design-px (matches the pre-recipe size).
const LABEL_STYLE = {
	fontFamily: "monospace",
	fontSize: 14,
	fill: COLOR_INFO_TEXT,
} as const;

const slot_origin = (idx: number): { x: number; y: number } => {
	const col = idx % COLS;
	const row = Math.floor(idx / COLS);
	return {
		x: GRID_X + col * (SLOT_SIZE + SLOT_GAP),
		y: GRID_Y + row * (SLOT_SIZE + SLOT_GAP),
	};
};

export type SlotRect = { x: number; y: number; w: number; h: number };

export const slot_rects: ReadonlyArray<SlotRect> = Array.from({ length: SLOT_COUNT }, (_, i) => {
	const o = slot_origin(i);
	return { x: o.x, y: o.y, w: SLOT_SIZE, h: SLOT_SIZE };
});

export const slot_at = (x: number, y: number): number | null => {
	for (let i = 0; i < slot_rects.length; i++) {
		const r = slot_rects[i]!;
		if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
	}
	return null;
};

const equipped_set = (eq: Equipment | null): Set<string> => {
	const s = new Set<string>();
	if (!eq) return s;
	if (eq.weapon) s.add(eq.weapon);
	if (eq.offhand) s.add(eq.offhand);
	if (eq.ring1) s.add(eq.ring1);
	if (eq.ring2) s.add(eq.ring2);
	return s;
};

const def_for = (registry: ItemRegistry | null, item_id: string | null): ItemDef | null => {
	if (!registry || !item_id) return null;
	return (registry.items.get(item_id as ItemId) ?? null) as ItemDef | null;
};

const format_modifier = (def: ItemDef): string => {
	const m = def.modifier;
	const parts: string[] = [];
	if (m.atk !== undefined) parts.push(`atk +${m.atk}`);
	if (m.def !== undefined) parts.push(`def +${m.def}`);
	if (m.hp !== undefined) parts.push(`hp +${m.hp}`);
	if (m.spd_mul !== undefined) parts.push(`spd x${(1 + m.spd_mul).toFixed(2)}`);
	if (m.crit_mul !== undefined) parts.push(`crit x${(1 + m.crit_mul).toFixed(2)}`);
	return parts.join("\n");
};

// resolve_frame — look up a named atlas frame and return its Texture, or null
// if the atlas isn't loaded / the frame is missing. Mirrors forge's internal
// resolve_texture helper (not exported).
const resolve_frame = (assets: Assets | undefined, alias: string, frame: string): Texture | null => {
	if (!assets) return null;
	const sheet = assets.atlas(alias);
	if (!sheet.ok) return null;
	const tex = (sheet.value.textures as Record<string, Texture | undefined>)[frame];
	return tex ?? null;
};

export type InventoryUIOpts = {
	on_slot_click: (idx: number) => void;
	get_inventory: () => Inventory | null;
	get_equipment: () => Equipment | null;
	get_registry: () => ItemRegistry | null;
	get_open: () => boolean;
	get_selected: () => number | null;
	assets?: Assets;
};

export type InventoryUI = {
	container: Container;
	system: System;
	attach_pointer: (canvas: HTMLCanvasElement, cam: Camera) => () => void;
};

export const make_inventory_ui = (opts: InventoryUIOpts): InventoryUI => {
	const container = new Container();
	container.label = "lt.inventory_ui";
	container.visible = false;

	const backdrop = new Graphics();
	backdrop.label = "lt.inventory_ui.backdrop";
	container.addChild(backdrop);

	const slot_layer = new Graphics();
	slot_layer.label = "lt.inventory_ui.slots";
	container.addChild(slot_layer);

	const sprite_layer = new Container();
	sprite_layer.label = "lt.inventory_ui.sprites";
	container.addChild(sprite_layer);

	// Per-slot Sprite. Lazy frame attach: first redraw after the atlas loads
	// resolves the texture and assigns it to the matching slot's Sprite.
	const slot_sprites: Sprite[] = [];
	for (let i = 0; i < SLOT_COUNT; i++) {
		const r = slot_rects[i]!;
		const sp = new Sprite();
		sp.label = `lt.inventory_ui.slot_${i}`;
		sp.anchor.set(0.5, 0.5);
		sp.position.set(r.x + r.w / 2, r.y + r.h / 2);
		sp.visible = false;
		sprite_layer.addChild(sp);
		slot_sprites.push(sp);
	}

	const info_layer = new Graphics();
	info_layer.label = "lt.inventory_ui.info_bg";
	container.addChild(info_layer);

	const info_name = new Text({ text: "", style: LABEL_STYLE, resolution: 4 });
	info_name.scale.set(0.5);
	info_name.position.set(INFO_X + INFO_PAD, INFO_Y + INFO_PAD);
	container.addChild(info_name);

	const info_modifier = new Text({ text: "", style: LABEL_STYLE, resolution: 4 });
	info_modifier.scale.set(0.5);
	info_modifier.position.set(INFO_X + INFO_PAD, INFO_Y + INFO_PAD + 10);
	container.addChild(info_modifier);

	const redraw = (): void => {
		const open = opts.get_open();
		container.visible = open;
		if (!open) return;

		const inv = opts.get_inventory();
		const eq = opts.get_equipment();
		const reg = opts.get_registry();
		const selected = opts.get_selected();
		const equipped = equipped_set(eq);

		backdrop.clear();
		backdrop.rect(0, 0, DESIGN_W, DESIGN_H).fill({ color: COLOR_BACKDROP, alpha: BACKDROP_ALPHA });

		slot_layer.clear();
		for (let i = 0; i < SLOT_COUNT; i++) {
			const r = slot_rects[i]!;
			const item_id = inv?.slots[i] ?? null;
			const def = def_for(reg, item_id);
			slot_layer.rect(r.x, r.y, r.w, r.h).fill({ color: COLOR_EMPTY });
			const border = item_id && equipped.has(item_id)
				? COLOR_BORDER_EQUIPPED
				: COLOR_BORDER;
			slot_layer.rect(r.x, r.y, r.w, r.h).stroke({ color: border, width: 1 });

			const sp = slot_sprites[i]!;
			if (def) {
				const tex = resolve_frame(opts.assets, "dungeon", def.frame);
				if (tex) {
					sp.texture = tex;
					sp.visible = true;
				} else {
					sp.visible = false;
				}
			} else {
				sp.visible = false;
			}
		}
		if (selected !== null && selected >= 0 && selected < SLOT_COUNT) {
			const r = slot_rects[selected]!;
			slot_layer.rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2).stroke({ color: COLOR_BORDER_SELECTED, width: 1 });
		}

		info_layer.clear();
		info_layer.rect(INFO_X, INFO_Y, INFO_W, GRID_H).fill({ color: COLOR_INFO_BG, alpha: 0.9 });
		info_layer.rect(INFO_X, INFO_Y, INFO_W, GRID_H).stroke({ color: COLOR_BORDER, width: 1 });

		const selected_id = selected !== null ? inv?.slots[selected] ?? null : null;
		const selected_def = def_for(reg, selected_id);
		if (selected_def) {
			info_name.text = selected_def.name;
			info_modifier.text = format_modifier(selected_def);
		} else {
			info_name.text = selected !== null ? "(empty)" : "";
			info_modifier.text = "";
		}
	};

	const system: System = () => {
		redraw();
	};

	const attach_pointer = (canvas: HTMLCanvasElement, cam: Camera): (() => void) => {
		const handler = (e: PointerEvent): void => {
			if (!opts.get_open()) return;
			const p = event_to_world(e, canvas, cam);
			const idx = slot_at(p.x, p.y);
			if (idx === null) return;
			opts.on_slot_click(idx);
		};
		canvas.addEventListener("pointerdown", handler);
		return () => canvas.removeEventListener("pointerdown", handler);
	};

	return { container, system, attach_pointer };
};
