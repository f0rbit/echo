import type { System } from "@f0rbit/forge";
import { Container, Text, type Texture } from "pixi.js";
import { event_to_world, type Camera } from "@f0rbit/forge/pixi";
import type { PerkDef, PerkId, PerkRegistry } from "../data/perks.ts";
import { g } from "../grid.ts";
import { make_panel, DEFAULT_PANEL_INSETS } from "../ui/panel.ts";
import { make_button, type Button } from "../ui/button.ts";
import type { UiTextureName } from "../ui/assets.ts";

// perk-choice-ui.ts — modal level-up overlay on app.stage (sibling of
// surface_sprite, below palette_overlay) per echo AGENTS.md "Game UI
// overlays — app.stage sibling, mirror surface_sprite". Visible iff
// progress_r.paused && level_up_pending_r.pending.
//
// PHASE 2 REWRITE — Graphics.rect internals swapped for Panel + Button[]
// (.plans/progress-gui-overhaul.md §6 Phase 2.2). Public surface is
// byte-stable: BUTTON_COUNT/W/H/GAP constants, ButtonRect, button_rects,
// button_at, PerkChoiceUI, PerkChoiceUIOpts (gains required get_ui_textures),
// make_perk_choice_ui factory — all unchanged in shape and (where applicable)
// numeric values. test/perk-choice-ui.test.ts stays green without amendment.
//
// 3 horizontal buttons centered on the design canvas. Each button shows the
// perk name + modifier text. Click (via event_to_world hit-test) or
// keyboard 1/2/3 (handled by input.ts → perks_sys.queue_perk_pick) routes
// to the same closure-local queue.
//
// PRESSED STATE NOT WIRED. Plan §6 §2.2 risk note: the modal closes
// immediately on pick, so a pressed-state transition would be invisible.
// redraw() only ever calls Button.set_state("idle"). If a future consumer
// wants visual click feedback, wire a 100ms "pressed → idle" transition in
// attach_pointer before opts.on_pick fires. Tracked in
// UI-PROPOSED-AGENTS-UPDATES.md (Phase 3.2) as future work.
//
// PANEL TINT — darkened to 0x303040 with alpha 0.95. The chosen white-outline
// panel asset renders ~invisible on a light backdrop; the production modal
// replaces the prior 60%-opaque black Graphics.rect backdrop, so the panel
// itself must darken the scene behind it for the white-text title + buttons
// to stay legible (Phase 1 visual note).
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

const COLOR_TEXT = 0xffffff;
const PANEL_TINT = 0x303040;
const PANEL_ALPHA = 0.95;

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

export type UiTextures = Record<UiTextureName, Texture>;

export type PerkChoiceUIOpts = {
	on_pick: (idx: number) => void;
	get_visible: () => boolean;
	get_choices: () => readonly string[];
	get_registry: () => PerkRegistry | null;
	get_ui_textures: () => UiTextures;
};

export type PerkChoiceUI = {
	container: Container;
	system: System;
	attach_pointer: (canvas: HTMLCanvasElement, cam: Camera) => () => void;
};

export const make_perk_choice_ui = (opts: PerkChoiceUIOpts): PerkChoiceUI => {
	const textures = opts.get_ui_textures();

	const container = new Container();
	container.label = "pr.perk_choice_ui";
	container.visible = false;

	// 9-slice panel backdrop — fills the design canvas, darkened so white
	// text + button outlines stay legible against arbitrary scene content.
	const panel = make_panel({
		texture: textures.panel,
		width: DESIGN_W,
		height: DESIGN_H,
		insets: DEFAULT_PANEL_INSETS,
	});
	panel.container.label = "pr.perk_choice_ui.backdrop";
	panel.container.tint = PANEL_TINT;
	panel.container.alpha = PANEL_ALPHA;
	container.addChild(panel.container);

	// 3 Button instances — positioned once at construction; redraw() only
	// updates state + per-button label text content.
	const buttons: Button[] = [];
	for (let i = 0; i < BUTTON_COUNT; i++) {
		const r = button_rects[i]!;
		const btn = make_button({
			idle_tex: textures.button,
			width: BUTTON_W,
			height: BUTTON_H,
		});
		btn.container.label = `pr.perk_choice_ui.button.${i}`;
		btn.container.position.set(r.x, r.y);
		btn.set_state("idle");
		container.addChild(btn.container);
		buttons.push(btn);
	}

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

		for (let i = 0; i < BUTTON_COUNT; i++) {
			buttons[i]!.set_state("idle");
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
