import type { System } from "@f0rbit/forge";
import { Container, Graphics, Text } from "pixi.js";
import type { Camera } from "@f0rbit/forge/pixi";
import type { Hp, Perks, Stats, Xp } from "../components.ts";
import { xp_threshold, type PerkId, type PerkRegistry } from "../data/perks.ts";

// hud.ts — top-right level/XP/HP/stats/perks panel on
// app.render.debug_overlay (unfiltered overlay container per echo AGENTS.md
// "Rendering conventions"). Always visible. Mirrors loot's stat-panel-hud
// shape but adds the XP bar Graphics + applied perks list.
//
// app.render.debug_overlay is in canvas-pixel space, so the system reads
// the camera viewport each tick to right-align.
//
// Crisp text: `resolution: 4` only — parent is `app.render.debug_overlay`
// (canvas-pixel space, no container scale). No `scale.set(0.5)` needed. See
// AGENTS.md "Crisp text recipe" (Phase 5.9.5).

const PANEL_W = 80;
const MARGIN = 4;
const LINE_HEIGHT = 9;
const XP_BAR_H = 4;
const XP_BAR_PAD = 2;

const LV_STYLE = {
	fontFamily: "monospace",
	fontSize: 10,
	fill: 0xffd24a,
	stroke: { color: 0x000000, width: 2 },
} as const;

const LABEL_STYLE = {
	fontFamily: "monospace",
	fontSize: 8,
	fill: 0xffffff,
	stroke: { color: 0x000000, width: 2 },
} as const;

const PERK_STYLE = {
	fontFamily: "monospace",
	fontSize: 7,
	fill: 0xc0c0c8,
	stroke: { color: 0x000000, width: 2 },
} as const;

const DEAD_STYLE = {
	fontFamily: "monospace",
	fontSize: 14,
	fill: 0xff4a4a,
	stroke: { color: 0x000000, width: 3 },
	align: "center",
} as const;

const COLOR_XP_BG = 0x202028;
const COLOR_XP_FILL = 0x7aa2f7;
const COLOR_XP_BORDER = 0x4a4a55;

export type HudOpts = {
	get_stats: () => Stats | null;
	get_xp: () => Xp | null;
	get_hp: () => Hp | null;
	get_perks: () => Perks | null;
	get_registry: () => PerkRegistry | null;
	get_dead: () => boolean;
	camera: Camera;
};

export type Hud = {
	container: Container;
	system: System;
};

export const make_hud = (opts: HudOpts): Hud => {
	const container = new Container();
	container.label = "pr.hud";
	container.zIndex = 9999;

	const lv_text = new Text({ text: "LV 1", style: LV_STYLE, resolution: 4 });
	lv_text.position.set(0, 0);
	container.addChild(lv_text);

	const xp_bar = new Graphics();
	xp_bar.label = "pr.hud.xp_bar";
	container.addChild(xp_bar);

	const hp_text = new Text({ text: "HP 0/0", style: LABEL_STYLE, resolution: 4 });
	container.addChild(hp_text);

	const stats_text = new Text({ text: "", style: LABEL_STYLE, resolution: 4 });
	container.addChild(stats_text);

	const perks_label = new Text({ text: "Perks:", style: LABEL_STYLE, resolution: 4 });
	container.addChild(perks_label);

	const perk_lines: Text[] = [];
	for (let i = 0; i < 6; i++) {
		const t = new Text({ text: "", style: PERK_STYLE, resolution: 4 });
		container.addChild(t);
		perk_lines.push(t);
	}

	// Center-screen "YOU DIED — press R" overlay. Anchored at (0.5, 0.5)
	// so positioning is just the viewport center. Hidden when not dead.
	const dead_text = new Text({ text: "YOU DIED\npress R", style: DEAD_STYLE, resolution: 4 });
	dead_text.anchor.set(0.5, 0.5);
	dead_text.visible = false;
	container.addChild(dead_text);

	const perk_name = (registry: PerkRegistry | null, perk_id: string): string => {
		if (!registry) return perk_id;
		const def = registry.perks.get(perk_id as PerkId);
		return def ? def.name : perk_id;
	};

	const xp_fill_ratio = (xp: Xp | null): number => {
		if (!xp) return 0;
		const threshold = xp_threshold(xp.level);
		if (threshold <= 0) return 0;
		const r = xp.current / threshold;
		return r < 0 ? 0 : r > 1 ? 1 : r;
	};

	const system: System = () => {
		const xp = opts.get_xp();
		const hp = opts.get_hp();
		const stats = opts.get_stats();
		const perks = opts.get_perks();
		const registry = opts.get_registry();

		lv_text.text = `LV ${xp ? xp.level : 1}`;

		const bar_y = 14;
		const bar_w = PANEL_W - XP_BAR_PAD * 2;
		const ratio = xp_fill_ratio(xp);
		xp_bar.clear();
		xp_bar.rect(XP_BAR_PAD, bar_y, bar_w, XP_BAR_H).fill({ color: COLOR_XP_BG });
		if (ratio > 0) xp_bar.rect(XP_BAR_PAD, bar_y, bar_w * ratio, XP_BAR_H).fill({ color: COLOR_XP_FILL });
		xp_bar.rect(XP_BAR_PAD, bar_y, bar_w, XP_BAR_H).stroke({ color: COLOR_XP_BORDER, width: 1 });

		const hp_y = bar_y + XP_BAR_H + 4;
		hp_text.position.set(0, hp_y);
		hp_text.text = `HP ${hp ? hp.current : 0}/${hp ? hp.max : 0}`;

		const stats_y = hp_y + LINE_HEIGHT;
		stats_text.position.set(0, stats_y);
		stats_text.text = stats
			? `A${stats.atk} D${stats.def} S${stats.spd.toFixed(2)}`
			: "A0 D0 S1.00";

		const perks_y = stats_y + LINE_HEIGHT;
		perks_label.position.set(0, perks_y);

		const applied = perks ? perks.applied : [];
		for (let i = 0; i < perk_lines.length; i++) {
			const line = perk_lines[i]!;
			line.position.set(0, perks_y + LINE_HEIGHT + i * (LINE_HEIGHT - 1));
			line.text = i < applied.length ? `- ${perk_name(registry, applied[i]!)}` : "";
		}

		const vp = opts.camera.viewport();
		container.position.set(vp.view.width - PANEL_W - MARGIN, MARGIN);

		// Dead overlay — centered on the canvas viewport. The HUD container
		// is positioned at the top-right, so position the dead text relative
		// to that origin to land in the center of the screen.
		const dead = opts.get_dead();
		dead_text.visible = dead;
		if (dead) {
			dead_text.position.set(
				-(vp.view.width - PANEL_W - MARGIN) + vp.view.width / 2,
				-MARGIN + vp.view.height / 2,
			);
		}
	};

	return { container, system };
};
