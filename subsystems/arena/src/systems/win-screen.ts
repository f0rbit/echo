import type { System } from "@f0rbit/forge";
import { Container, Graphics, Text } from "pixi.js";
import { g } from "../grid.ts";
import { game_state_r } from "../resources.ts";

// win-screen.ts — "WAVES CLEARED" overlay shown when game_state_r.state ===
// "won". Same app.stage sibling + crisp-text pattern as menu-screen.

const DESIGN_W = g.cols * g.tile;
const DESIGN_H = g.rows * g.tile;

const COLOR_BACKDROP = 0x000000;
const BACKDROP_ALPHA = 0.7;
const TITLE_COLOR = 0x9ece6a;
const PROMPT_COLOR = 0xffffff;

const TITLE_STYLE = {
	fontFamily: "monospace",
	fontSize: 24,
	fill: TITLE_COLOR,
	fontWeight: "bold" as const,
};

const PROMPT_STYLE = {
	fontFamily: "monospace",
	fontSize: 12,
	fill: PROMPT_COLOR,
};

const crisp_text = (text: string, style: Record<string, unknown>): Text => {
	const t = new Text({ text, style, resolution: 4 });
	t.scale.set(0.5);
	return t;
};

export type WinScreen = {
	container: Container;
	system: System;
};

export const make_win_screen = (): WinScreen => {
	const container = new Container();
	container.label = "ar.win_screen";
	container.visible = false;

	const backdrop = new Graphics();
	backdrop.label = "ar.win_screen.backdrop";
	backdrop.rect(0, 0, DESIGN_W, DESIGN_H).fill({ color: COLOR_BACKDROP, alpha: BACKDROP_ALPHA });
	container.addChild(backdrop);

	const title = crisp_text("WAVES CLEARED", TITLE_STYLE);
	title.anchor.set(0.5, 0.5);
	title.position.set(DESIGN_W / 2, DESIGN_H / 2 - 12);
	container.addChild(title);

	const prompt = crisp_text("PRESS R TO RESTART", PROMPT_STYLE);
	prompt.anchor.set(0.5, 0.5);
	prompt.position.set(DESIGN_W / 2, DESIGN_H / 2 + 16);
	container.addChild(prompt);

	const system: System = (_w, ctx) => {
		const gs = ctx.res.get(game_state_r);
		container.visible = gs.ok && gs.value.state === "won";
	};

	return { container, system };
};
