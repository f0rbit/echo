// dead-screen-ui.ts — full-screen modal overlay shown while
// `progress_r.dead === true`. Mirrors perk-choice-ui.ts's container +
// render-system + (optional) attach_pointer shape so the wiring in
// main.ts stays homogeneous.
//
// PLACEMENT — Container on `app.stage` as a sibling of `surface_sprite`,
// BELOW `palette_overlay` (per echo AGENTS.md "Sibling z-order in
// `app.stage`"). main.ts mirrors `surface_sprite.scale/position` onto
// the container so design-coord layout + event_to_world hit-tests line
// up with the rendered geometry.
//
// CRISP TEXT — `resolution: 4` + `text.scale.set(0.5)` since the parent
// is an app.stage sibling mirroring surface_sprite (per AGENTS.md
// "Crisp text recipe"). Identical recipe to perk-choice-ui.ts.
//
// VISIBILITY — driven entirely by `opts.get_dead()`. The R-key restart
// is handled by the existing `restart.ts` system (no new bindings).
// Pointer click on the Restart button enqueues a synthetic input
// action so the click path matches the keyboard path — see attach_pointer.
//
// Z-ORDER — see main.ts wiring (`addChildAt(palette_idx)` to place
// below the palette overlay; perk-choice modal sits at the same depth,
// inserted earlier, so order between dead-screen + perk-choice on
// app.stage matters only if both go visible simultaneously. dead is
// terminal — paused level-up modals can't trigger after death because
// xp gain is gated on !paused && !dead — so they don't visually overlap
// in practice).

import type { System } from "@f0rbit/forge";
import { Container, Text, type Texture } from "pixi.js";
import { event_to_world, type Camera } from "@f0rbit/forge/pixi";
import { g } from "../grid.ts";
import { make_panel, DEFAULT_PANEL_INSETS } from "../ui/panel.ts";
import { make_button, type Button } from "../ui/button.ts";
import type { UiTextureName } from "../ui/assets.ts";

const DESIGN_W = g.cols * g.tile;
const DESIGN_H = g.rows * g.tile;

const PANEL_W = 160;
const PANEL_H = 80;
const PANEL_X = Math.round((DESIGN_W - PANEL_W) / 2);
const PANEL_Y = Math.round((DESIGN_H - PANEL_H) / 2);

const BUTTON_W = 70;
const BUTTON_H = 20;
const BUTTON_X = Math.round((DESIGN_W - BUTTON_W) / 2);
const BUTTON_Y = PANEL_Y + PANEL_H - BUTTON_H - 10;

const COLOR_TEXT = 0xffffff;
const COLOR_TITLE = 0xff4a4a;
const BACKDROP_TINT = 0x303040;
const BACKDROP_ALPHA = 0.95;
const PANEL_TINT = 0xffffff;
const PANEL_ALPHA = 1;

// fontSize + wordWrapWidth doubled vs. design because Text gets
// `scale.set(0.5)` (crisp-text recipe). Visible size = stored × 0.5.
const TITLE_STYLE = {
	fontFamily: "monospace",
	fontSize: 28,
	fill: COLOR_TITLE,
	stroke: { color: 0x000000, width: 5 },
	align: "center" as const,
} as const;

const SUBTITLE_STYLE = {
	fontFamily: "monospace",
	fontSize: 14,
	fill: COLOR_TEXT,
	stroke: { color: 0x000000, width: 3 },
	align: "center" as const,
} as const;

const BUTTON_LABEL_STYLE = {
	fontFamily: "monospace",
	fontSize: 14,
	fill: COLOR_TEXT,
	stroke: { color: 0x000000, width: 3 },
	align: "center" as const,
} as const;

export type DeadScreenButtonRect = { x: number; y: number; w: number; h: number };

export const dead_screen_button_rect: DeadScreenButtonRect = {
	x: BUTTON_X,
	y: BUTTON_Y,
	w: BUTTON_W,
	h: BUTTON_H,
};

export const dead_screen_button_hit = (x: number, y: number): boolean => {
	const r = dead_screen_button_rect;
	return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
};

const crisp_text = (text: string, style: Record<string, unknown>): Text => {
	const t = new Text({ text, style, resolution: 4 });
	t.scale.set(0.5);
	return t;
};

export type UiTextures = Record<UiTextureName, Texture>;

export type DeadScreenUIOpts = {
	on_restart: () => void;
	get_dead: () => boolean;
	get_ui_textures: () => UiTextures;
};

export type DeadScreenUI = {
	container: Container;
	system: System;
	attach_pointer: (canvas: HTMLCanvasElement, cam: Camera) => () => void;
};

export const make_dead_screen_ui = (opts: DeadScreenUIOpts): DeadScreenUI => {
	const textures = opts.get_ui_textures();

	const container = new Container();
	container.label = "pr.dead_screen_ui";
	container.visible = false;

	// Full-canvas backdrop — same tint/alpha as perk-choice so the two
	// modals read as the same UI family. The dim mat behind the centred
	// modal panel makes the white text + button label legible against
	// arbitrary scene content underneath.
	const backdrop = make_panel({
		texture: textures.panel,
		width: DESIGN_W,
		height: DESIGN_H,
		insets: DEFAULT_PANEL_INSETS,
	});
	backdrop.container.label = "pr.dead_screen_ui.backdrop";
	backdrop.container.tint = BACKDROP_TINT;
	backdrop.container.alpha = BACKDROP_ALPHA;
	container.addChild(backdrop.container);

	// Centred modal panel — undimmed so the panel art reads at full
	// brightness against the backdrop.
	const panel = make_panel({
		texture: textures.panel,
		width: PANEL_W,
		height: PANEL_H,
		insets: DEFAULT_PANEL_INSETS,
	});
	panel.container.label = "pr.dead_screen_ui.panel";
	panel.container.position.set(PANEL_X, PANEL_Y);
	panel.container.tint = PANEL_TINT;
	panel.container.alpha = PANEL_ALPHA;
	container.addChild(panel.container);

	const title = crisp_text("YOU DIED", TITLE_STYLE);
	title.anchor.set(0.5, 0);
	title.position.set(DESIGN_W / 2, PANEL_Y + 8);
	container.addChild(title);

	const subtitle = crisp_text("press R to restart", SUBTITLE_STYLE);
	subtitle.anchor.set(0.5, 0);
	subtitle.position.set(DESIGN_W / 2, PANEL_Y + 32);
	container.addChild(subtitle);

	const restart_button: Button = make_button({
		idle_tex: textures.button,
		width: BUTTON_W,
		height: BUTTON_H,
	});
	restart_button.container.label = "pr.dead_screen_ui.restart_button";
	restart_button.container.position.set(BUTTON_X, BUTTON_Y);
	restart_button.set_state("idle");
	container.addChild(restart_button.container);

	const button_label = crisp_text("Restart", BUTTON_LABEL_STYLE);
	button_label.anchor.set(0.5, 0.5);
	button_label.position.set(BUTTON_X + BUTTON_W / 2, BUTTON_Y + BUTTON_H / 2);
	container.addChild(button_label);

	const system: System = () => {
		const dead = opts.get_dead();
		container.visible = dead;
		if (!dead) restart_button.set_state("idle");
	};

	const attach_pointer = (canvas: HTMLCanvasElement, cam: Camera): (() => void) => {
		const handler = (e: PointerEvent): void => {
			if (!opts.get_dead()) return;
			const p = event_to_world(e, canvas, cam);
			if (!dead_screen_button_hit(p.x, p.y)) return;
			opts.on_restart();
		};
		canvas.addEventListener("pointerdown", handler);
		return () => canvas.removeEventListener("pointerdown", handler);
	};

	return { container, system, attach_pointer };
};
