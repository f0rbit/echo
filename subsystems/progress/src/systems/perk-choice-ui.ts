import type { System } from "@f0rbit/forge";
import { Container, Graphics, Text } from "pixi.js";
import { event_to_world, type Camera } from "@f0rbit/forge/pixi";
import type { PerkDef, PerkId, PerkRegistry } from "../data/perks.ts";
import { g } from "../grid.ts";

// perk-choice-ui.ts — modal level-up overlay on app.stage (sibling of
// surface_sprite, below palette_overlay) per echo AGENTS.md "Game UI
// overlays — app.stage sibling, mirror surface_sprite". Visible iff
// progress_r.paused && level_up_pending_r.pending.
//
// 3 horizontal buttons centered on the design canvas. Each button shows the
// perk name + modifier text. Click (via event_to_world hit-test) or
// keyboard 1/2/3 (handled by input.ts → perks_sys.queue_perk_pick) routes
// to the same closure-local queue. Per .plans/progress.md §5 Phase 5.4
// and §2 Q4 / Q15.
//
// Hit-test math (button_rects + button_at) is pure and unit-tested in
// test/perk-choice-ui.test.ts. NEVER reimplement fit_scale — event_to_world
// covers DPR + RenderTexture math (echo AGENTS.md "Canvas → world coords").
//
// Crisp text: `resolution: 4` + `text.scale.set(0.5)` — parent is `app.stage`
// modal mirroring `surface_sprite`. See AGENTS.md "Crisp text recipe".

const DESIGN_W = g.cols * g.tile;
const DESIGN_H = g.rows * g.tile;

const BUTTON_W = 80;
const BUTTON_H = 40;
const BUTTON_GAP = 8;
const BUTTON_COUNT = 3;

const GRID_W = BUTTON_COUNT * BUTTON_W + (BUTTON_COUNT - 1) * BUTTON_GAP;
const GRID_X = Math.round((DESIGN_W - GRID_W) / 2);
const GRID_Y = Math.round((DESIGN_H - BUTTON_H) / 2);

const COLOR_BACKDROP = 0x000000;
const BACKDROP_ALPHA = 0.6;
const COLOR_BUTTON_FILL = 0x202028;
const COLOR_BORDER = 0x4a4a55;
const COLOR_TEXT = 0xffffff;

// fontSize + wordWrapWidth doubled vs. design because Text gets
// `scale.set(0.5)` — crisp-text recipe renders the glyph cache at 4× DPI
// then halves display. Visible size = stored × 0.5 = original design value.
// wordWrap works in the pre-scale source space, so wordWrapWidth doubles
// alongside fontSize to keep the same effective wrap width on screen.
const TITLE_STYLE = {
	fontFamily: "monospace",
	fontSize: 16,
	fill: COLOR_TEXT,
	stroke: { color: 0x000000, width: 4 },
} as const;

const NAME_STYLE = {
	fontFamily: "monospace",
	fontSize: 16,
	fill: COLOR_TEXT,
	wordWrap: true,
	wordWrapWidth: (BUTTON_W - 6) * 2,
	align: "center" as const,
} as const;

const MOD_STYLE = {
	fontFamily: "monospace",
	fontSize: 14,
	fill: 0xc0c0c8,
	wordWrap: true,
	wordWrapWidth: (BUTTON_W - 6) * 2,
	align: "center" as const,
} as const;

export type ButtonRect = { x: number; y: number; w: number; h: number };

const make_rect = (idx: number): ButtonRect => ({
	x: GRID_X + idx * (BUTTON_W + BUTTON_GAP),
	y: GRID_Y,
	w: BUTTON_W,
	h: BUTTON_H,
});

export const button_rects: ReadonlyArray<ButtonRect> = Array.from(
	{ length: BUTTON_COUNT },
	(_, i) => make_rect(i),
);

export const button_at = (x: number, y: number): number | null => {
	for (let i = 0; i < button_rects.length; i++) {
		const r = button_rects[i]!;
		if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
	}
	return null;
};

const format_modifier = (def: PerkDef): string => {
	const m = def.modifier;
	const parts: string[] = [];
	if (m.atk !== undefined) parts.push(`+${m.atk} atk`);
	if (m.def !== undefined) parts.push(`+${m.def} def`);
	if (m.hp !== undefined) parts.push(`+${m.hp} hp`);
	if (m.spd_mul !== undefined) parts.push(`spd x${(1 + m.spd_mul).toFixed(2)}`);
	if (m.xp_gain_mul !== undefined) parts.push(`xp x${(1 + m.xp_gain_mul).toFixed(2)}`);
	return parts.join("\n");
};

const def_for = (registry: PerkRegistry | null, perk_id: string | null): PerkDef | null => {
	if (!registry || !perk_id) return null;
	return registry.perks.get(perk_id as PerkId) ?? null;
};

const crisp_text = (text: string, style: Record<string, unknown>): Text => {
	const t = new Text({ text, style, resolution: 4 });
	t.scale.set(0.5);
	return t;
};

export type PerkChoiceUIOpts = {
	on_pick: (idx: number) => void;
	get_visible: () => boolean;
	get_choices: () => readonly string[];
	get_registry: () => PerkRegistry | null;
};

export type PerkChoiceUI = {
	container: Container;
	system: System;
	attach_pointer: (canvas: HTMLCanvasElement, cam: Camera) => () => void;
};

export const make_perk_choice_ui = (opts: PerkChoiceUIOpts): PerkChoiceUI => {
	const container = new Container();
	container.label = "pr.perk_choice_ui";
	container.visible = false;

	const backdrop = new Graphics();
	backdrop.label = "pr.perk_choice_ui.backdrop";
	container.addChild(backdrop);

	const button_layer = new Graphics();
	button_layer.label = "pr.perk_choice_ui.buttons";
	container.addChild(button_layer);

	const title = crisp_text("Choose a perk (1/2/3 or click)", TITLE_STYLE);
	title.anchor.set(0.5, 0);
	title.position.set(DESIGN_W / 2, GRID_Y - 20);
	container.addChild(title);

	const name_texts: Text[] = [];
	const mod_texts: Text[] = [];
	for (let i = 0; i < BUTTON_COUNT; i++) {
		const r = button_rects[i]!;
		const name = crisp_text("", NAME_STYLE);
		name.anchor.set(0.5, 0);
		name.position.set(r.x + r.w / 2, r.y + 4);
		container.addChild(name);
		name_texts.push(name);

		const mod = crisp_text("", MOD_STYLE);
		mod.anchor.set(0.5, 0);
		mod.position.set(r.x + r.w / 2, r.y + 20);
		container.addChild(mod);
		mod_texts.push(mod);
	}

	const redraw = (): void => {
		const visible = opts.get_visible();
		container.visible = visible;
		if (!visible) return;

		const choices = opts.get_choices();
		const registry = opts.get_registry();

		backdrop.clear();
		backdrop.rect(0, 0, DESIGN_W, DESIGN_H).fill({ color: COLOR_BACKDROP, alpha: BACKDROP_ALPHA });

		button_layer.clear();
		for (let i = 0; i < BUTTON_COUNT; i++) {
			const r = button_rects[i]!;
			button_layer.rect(r.x, r.y, r.w, r.h).fill({ color: COLOR_BUTTON_FILL });
			button_layer.rect(r.x, r.y, r.w, r.h).stroke({ color: COLOR_BORDER, width: 1 });

			const perk_id = choices[i] ?? null;
			const def = def_for(registry, perk_id);
			name_texts[i]!.text = def ? `${i + 1}. ${def.name}` : `${i + 1}.`;
			mod_texts[i]!.text = def ? format_modifier(def) : "";
		}
	};

	const system: System = () => {
		redraw();
	};

	const attach_pointer = (canvas: HTMLCanvasElement, cam: Camera): (() => void) => {
		const handler = (e: PointerEvent): void => {
			if (!opts.get_visible()) return;
			const p = event_to_world(e, canvas, cam);
			const idx = button_at(p.x, p.y);
			if (idx === null) return;
			opts.on_pick(idx);
		};
		canvas.addEventListener("pointerdown", handler);
		return () => canvas.removeEventListener("pointerdown", handler);
	};

	return { container, system, attach_pointer };
};
