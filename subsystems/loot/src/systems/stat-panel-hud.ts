import type { System } from "@f0rbit/forge";
import { Container, Text } from "pixi.js";
import type { Camera } from "@f0rbit/forge/pixi";
import type { Stats } from "../components.ts";

// stat-panel-hud.ts — top-right ATK/DEF/SPD/HP panel on
// app.render.debug_overlay (unfiltered overlay container per echo AGENTS.md
// "Rendering conventions"). Mirrors arena's debug-overlay.ts: 4 Text lines,
// per-tick text mutation. `app.render.debug_overlay` is in canvas-pixel space
// (it sits on app.stage alongside surface_sprite), so we right-align by
// reading the camera's viewport each tick.
//
// Crisp text: `resolution: 4` only — parent is `app.render.debug_overlay`
// (canvas-pixel space, no container scale). No `scale.set(0.5)` needed. See
// AGENTS.md "Crisp text recipe" (Phase 5.9.5).

const LABEL_STYLE = {
	fontFamily: "monospace",
	fontSize: 8,
	fill: 0xffffff,
	stroke: { color: 0x000000, width: 2 },
} as const;

const LINE_HEIGHT = 10;
const PANEL_W = 56;
const MARGIN = 4;

export type StatPanelOpts = {
	get_stats: () => Stats | null;
	camera: Camera;
};

export type StatPanelHud = {
	container: Container;
	system: System;
};

export const make_stat_panel_hud = (opts: StatPanelOpts): StatPanelHud => {
	const container = new Container();
	container.label = "lt.stat_panel_hud";
	container.zIndex = 9999;

	const atk = new Text({ text: "ATK 0", style: LABEL_STYLE, resolution: 4 });
	atk.position.set(0, 0);
	const def = new Text({ text: "DEF 0", style: LABEL_STYLE, resolution: 4 });
	def.position.set(0, LINE_HEIGHT);
	const spd = new Text({ text: "SPD 1.00", style: LABEL_STYLE, resolution: 4 });
	spd.position.set(0, LINE_HEIGHT * 2);
	const hp = new Text({ text: "HP  0", style: LABEL_STYLE, resolution: 4 });
	hp.position.set(0, LINE_HEIGHT * 3);
	container.addChild(atk, def, spd, hp);

	const system: System = () => {
		const s = opts.get_stats();
		atk.text = `ATK ${s ? s.atk : 0}`;
		def.text = `DEF ${s ? s.def : 0}`;
		spd.text = `SPD ${(s ? s.spd : 1).toFixed(2)}`;
		hp.text = `HP  ${s ? s.hp : 0}`;
		const vp = opts.camera.viewport();
		container.position.set(vp.view.width - PANEL_W - MARGIN, MARGIN);
	};

	return { container, system };
};
