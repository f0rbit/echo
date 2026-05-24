import { Container, NineSliceSprite, type Texture } from "pixi.js";
import { DEFAULT_PANEL_INSETS, type PanelInsets } from "./panel.ts";

// FORGE-PROMOTION-CANDIDATE — forge.ui (1/3 consumers)
//
// Current consumers:
//   - subsystems/progress/src/main-debug-gui.ts (cookbook fixture; Phase 1)
//   - subsystems/progress/src/systems/perk-choice-ui.ts (level-up modal; Phase 2)
//
// Planned promotion: Phase 8 main → @f0rbit/forge/ui, once the 3rd consumer
// lands. Same convention as panel.ts.
//
// button.ts — NineSliceSprite-backed button with a 3-state visual surface
// (`idle` | `hover` | `pressed`) and a `get_bounds()` accessor so existing
// pure-function hit-test helpers (perk-choice-ui.ts's `button_at`) stay
// load-bearing without coupling to the rendered shape.
//
// HOVER/PRESSED FALLBACK — TINT MODULATION.
// Kenney's pack ships no distinct idle/hover/pressed PNGs (verified by
// inspection of every subfolder under public/ui-borders/). So `pressed_tex`
// and `hover_tex` are optional; when absent we modulate the single `idle_tex`
// via `sprite.tint`:
//
//   idle    → 0xffffff (no modulation)
//   hover   → 0xffd080 (warm tint, slightly brighter)
//   pressed → 0xc0c0c0 (cool desaturate, slightly darker)
//
// This is documented in .plans/progress-gui-overhaul.md §3.5. If a future
// asset pack ships distinct PNGs, pass them in and the tint path is skipped.
//
// SLICE INSETS — defaults to panel.ts's 8/8/8/8.
// Kenney's border / panel-border PNGs share the 48×48 footprint with the
// same outer frame thickness. Override via `insets` if a future asset diverges.

export type ButtonState = "idle" | "hover" | "pressed";

const TINT_IDLE = 0xffffff;
const TINT_HOVER = 0xffd080;
const TINT_PRESSED = 0xc0c0c0;

export type ButtonBounds = { x: number; y: number; w: number; h: number };

export type ButtonOpts = {
	idle_tex: Texture;
	hover_tex?: Texture;
	pressed_tex?: Texture;
	width: number;
	height: number;
	insets?: PanelInsets;
};

export type Button = {
	container: Container;
	set_state: (s: ButtonState) => void;
	get_bounds: () => ButtonBounds;
};

const tint_for = (s: ButtonState): number => {
	if (s === "hover") return TINT_HOVER;
	if (s === "pressed") return TINT_PRESSED;
	return TINT_IDLE;
};

export const make_button = (opts: ButtonOpts): Button => {
	const insets = opts.insets ?? DEFAULT_PANEL_INSETS;
	const make_slice = (tex: Texture): NineSliceSprite =>
		new NineSliceSprite({
			texture: tex,
			leftWidth: insets.left,
			topHeight: insets.top,
			rightWidth: insets.right,
			bottomHeight: insets.bottom,
			width: opts.width,
			height: opts.height,
		});

	const container = new Container();
	container.label = "ui.button";

	const idle = make_slice(opts.idle_tex);
	idle.label = "ui.button.idle";
	container.addChild(idle);

	const hover = opts.hover_tex ? make_slice(opts.hover_tex) : null;
	if (hover) {
		hover.label = "ui.button.hover";
		hover.visible = false;
		container.addChild(hover);
	}

	const pressed = opts.pressed_tex ? make_slice(opts.pressed_tex) : null;
	if (pressed) {
		pressed.label = "ui.button.pressed";
		pressed.visible = false;
		container.addChild(pressed);
	}

	const has_layered_states = hover !== null || pressed !== null;

	const set_state = (s: ButtonState): void => {
		if (has_layered_states) {
			idle.visible = s === "idle";
			if (hover) hover.visible = s === "hover";
			if (pressed) pressed.visible = s === "pressed";
			// idle tint stays clean; only the active layer renders.
			return;
		}
		// Single-texture fallback: modulate via tint.
		idle.tint = tint_for(s);
	};

	const get_bounds = (): ButtonBounds => ({
		x: container.position.x,
		y: container.position.y,
		w: opts.width,
		h: opts.height,
	});

	return { container, set_state, get_bounds };
};
