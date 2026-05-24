import { Container, NineSliceSprite, type Texture } from "pixi.js";

// FORGE-PROMOTION-CANDIDATE — forge.ui (1/3 consumers)
//
// Current consumers:
//   - subsystems/progress/src/main-debug-gui.ts (cookbook fixture; Phase 1)
//   - subsystems/progress/src/systems/perk-choice-ui.ts (level-up modal; Phase 2)
//
// Planned promotion: Phase 8 main → @f0rbit/forge/ui, once the 3rd consumer
// lands (boss Phase 6 or hub Phase 7). Until then this helper lives game-side
// per the AGENTS.md "Convention for duplicating bestiary's chaser AI" pattern
// (game-side until 3 consumers force generalisation).
//
// panel.ts — thin wrapper around Pixi v8's NineSliceSprite. Returns a
// Container (not the NineSliceSprite directly) so callers can addChild text /
// other children on top without the slice math leaking into the public API.
// Future-proof for an animated panel border, drop-shadow filter, etc.
//
// SLICE INSETS — empirical default 8/8/8/8.
// Kenney's 48×48 borders read as ~8 px visible outer frame on the chosen
// `panel-000.png`. Caller can override via the `insets` arg if a different
// asset needs different math. Derive by opening the PNG in an image editor
// and measuring the border thickness — set inset slightly tighter than the
// visible edge so the centre region tiles cleanly without bleeding the
// corner art (FRICTION.md §19 — slot reserved).

export type PanelInsets = {
	left: number;
	top: number;
	right: number;
	bottom: number;
};

export const DEFAULT_PANEL_INSETS: PanelInsets = { left: 8, top: 8, right: 8, bottom: 8 };

export type PanelOpts = {
	texture: Texture;
	width: number;
	height: number;
	insets?: PanelInsets;
};

export type Panel = {
	container: Container;
};

export const make_panel = (opts: PanelOpts): Panel => {
	const insets = opts.insets ?? DEFAULT_PANEL_INSETS;
	const sprite = new NineSliceSprite({
		texture: opts.texture,
		leftWidth: insets.left,
		topHeight: insets.top,
		rightWidth: insets.right,
		bottomHeight: insets.bottom,
		width: opts.width,
		height: opts.height,
	});
	sprite.label = "ui.panel.slice";
	const container = new Container();
	container.label = "ui.panel";
	container.addChild(sprite);
	return { container };
};
