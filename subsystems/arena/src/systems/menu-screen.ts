import type { System } from "@f0rbit/forge";
import { Container, Graphics, Text } from "pixi.js";
import { g } from "../grid.ts";
import { game_state_r } from "../resources.ts";

// menu-screen.ts — landing overlay on app.stage (sibling of surface_sprite,
// below palette_overlay) per echo AGENTS.md "Game UI overlays". Visible iff
// game_state_r.state === "menu". main.ts mirrors the surface_sprite scale +
// offset so this lays out in design-space.
//
// Crisp text recipe: `new Text({ resolution: 4 })` + `text.scale.set(0.5)`
// — renders at 4× resolution then scales down so glyphs stay sharp under the
// camera's integer-pixel scale. See AGENTS.md (5.9.5).

const DESIGN_W = g.cols * g.tile;
const DESIGN_H = g.rows * g.tile;

const COLOR_BACKDROP = 0x000000;
const BACKDROP_ALPHA = 0.7;

const TITLE_COLOR = 0xffd24a;
const TEXT_COLOR = 0xffffff;
const PROMPT_COLOR = 0x9ece6a;

const TITLE_STYLE = {
	fontFamily: "monospace",
	fontSize: 24,
	fill: TITLE_COLOR,
	fontWeight: "bold" as const,
};

const LINE_STYLE = {
	fontFamily: "monospace",
	fontSize: 10,
	fill: TEXT_COLOR,
};

const PROMPT_STYLE = {
	fontFamily: "monospace",
	fontSize: 12,
	fill: PROMPT_COLOR,
	fontWeight: "bold" as const,
};

const CONTROLS = [
	"WASD/ARROWS  - move",
	"Z            - melee",
	"X            - ranged",
	"R            - restart",
];

const crisp_text = (text: string, style: Record<string, unknown>): Text => {
	const t = new Text({ text, style, resolution: 4 });
	t.scale.set(0.5);
	return t;
};

export type MenuScreen = {
	container: Container;
	system: System;
};

export const make_menu_screen = (): MenuScreen => {
	const container = new Container();
	container.label = "ar.menu_screen";
	container.visible = false;

	const backdrop = new Graphics();
	backdrop.label = "ar.menu_screen.backdrop";
	backdrop.rect(0, 0, DESIGN_W, DESIGN_H).fill({ color: COLOR_BACKDROP, alpha: BACKDROP_ALPHA });
	container.addChild(backdrop);

	const title = crisp_text("ECHO ARENA", TITLE_STYLE);
	title.anchor.set(0.5, 0);
	title.position.set(DESIGN_W / 2, 24);
	container.addChild(title);

	const controls_y_start = 70;
	const controls_line_height = 12;
	for (let i = 0; i < CONTROLS.length; i++) {
		const line = crisp_text(CONTROLS[i]!, LINE_STYLE);
		line.anchor.set(0.5, 0);
		line.position.set(DESIGN_W / 2, controls_y_start + i * controls_line_height);
		container.addChild(line);
	}

	const prompt = crisp_text("PRESS SPACE TO START", PROMPT_STYLE);
	prompt.anchor.set(0.5, 1);
	prompt.position.set(DESIGN_W / 2, DESIGN_H - 16);
	container.addChild(prompt);

	const system: System = (_w, ctx) => {
		const gs = ctx.res.get(game_state_r);
		container.visible = gs.ok && gs.value.state === "menu";
	};

	return { container, system };
};
