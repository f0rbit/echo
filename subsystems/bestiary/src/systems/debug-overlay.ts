import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import type { Cell, Grid } from "@f0rbit/forge/grid";
import { Container, Graphics, Text } from "pixi.js";
import {
	chaser_c,
	minion_c,
	patrol_c,
	patroller_c,
	path_c,
	player_c,
	ranged_c,
	state_c,
	summoner_c,
	summoner_state_c,
} from "../components.ts";
import { debug_visible_r } from "../resources.ts";

const fov_radius = 6;
const ranged_close = 4;
const ranged_far = 8;

const label_style = {
	fontFamily: "monospace",
	fontSize: 8,
	fill: 0xffffff,
	stroke: { color: 0x000000, width: 1 },
} as const;

const make_label = (parent: Container): Text => {
	const t = new Text({ text: "", style: label_style });
	t.anchor.set(0.5, 1);
	t.zIndex = 1101;
	parent.addChild(t);
	return t;
};

export const make_debug_overlay = (parent: Container, gr: Grid): System => {
	const gfx = new Graphics();
	gfx.zIndex = 1100;
	parent.addChild(gfx);

	const labels: Text[] = [];
	let label_idx = 0;

	const acquire_label = (): Text => {
		const t = labels[label_idx] ?? make_label(parent);
		labels[label_idx] = t;
		label_idx++;
		return t;
	};

	const reset_labels = (): void => {
		for (const t of labels) t.visible = false;
		label_idx = 0;
	};

	const set_label = (cx: number, cy: number, text: string): void => {
		const t = acquire_label();
		t.text = text;
		t.position.set(cx, cy);
		t.visible = true;
	};

	const half = gr.tile / 2;

	return (w, ctx) => {
		const dv = ctx.res.get(debug_visible_r);
		const on = dv.ok ? dv.value.on : false;
		gfx.clear();
		reset_labels();
		if (!on) return;

		const players = w.query([pos_c, player_c] as const).collect();
		const player_pos = players[0]?.[1];
		if (player_pos) {
			const r = fov_radius * gr.tile;
			gfx.circle(player_pos.x + half, player_pos.y + half, r);
			gfx.stroke({ width: 1, color: 0x4488ff, alpha: 0.8 });
		}

		for (const [, p, st] of w.query([pos_c, state_c, chaser_c] as const).collect()) {
			set_label(p.x + half, p.y, st.kind);
			if (player_pos && st.kind === "chasing") {
				gfx.moveTo(p.x + half, p.y + half);
				gfx.lineTo(player_pos.x + half, player_pos.y + half);
				gfx.stroke({ width: 1, color: 0xff4444, alpha: 0.9 });
			}
		}

		for (const [, p, pat] of w.query([pos_c, patrol_c, patroller_c] as const).collect()) {
			set_label(p.x + half, p.y, pat.fsm.state);
			const wps = pat.waypoints;
			for (let i = 0; i < wps.length; i++) {
				const a = wps[i]!;
				const b = wps[(i + 1) % wps.length]!;
				draw_dotted(gfx, gr, a, b);
			}
		}

		for (const [, p] of w.query([pos_c, ranged_c] as const).collect()) {
			set_label(p.x + half, p.y, "ranged");
			gfx.circle(p.x + half, p.y + half, ranged_close * gr.tile);
			gfx.stroke({ width: 1, color: 0xff8888, alpha: 0.7 });
			gfx.circle(p.x + half, p.y + half, ranged_far * gr.tile);
			gfx.stroke({ width: 1, color: 0xff8888, alpha: 0.4 });
		}

		const minions_total = w.query([minion_c] as const).collect().length;
		for (const [, p, ss] of w.query([pos_c, summoner_state_c, summoner_c] as const).collect()) {
			set_label(p.x + half, p.y, `${minions_total}/${ss.max_minions}`);
		}

		for (const [, , pth] of w.query([pos_c, path_c] as const).collect()) {
			for (let i = pth.index; i < pth.cells.length - 1; i++) {
				const a = pth.cells[i]!;
				const b = pth.cells[i + 1]!;
				const aw = gr.cell_to_world(a.x, a.y);
				const bw = gr.cell_to_world(b.x, b.y);
				gfx.moveTo(aw.x + half, aw.y + half);
				gfx.lineTo(bw.x + half, bw.y + half);
				gfx.stroke({ width: 1, color: 0xffff44, alpha: 0.7 });
			}
		}
	};
};

const draw_dotted = (gfx: Graphics, gr: Grid, a: Cell, b: Cell): void => {
	const aw = gr.cell_to_world(a.x, a.y);
	const bw = gr.cell_to_world(b.x, b.y);
	const half = gr.tile / 2;
	const ax = aw.x + half;
	const ay = aw.y + half;
	const bx = bw.x + half;
	const by = bw.y + half;
	const dx = bx - ax;
	const dy = by - ay;
	const dist = Math.hypot(dx, dy);
	const dot_len = 3;
	const gap_len = 3;
	const step = dot_len + gap_len;
	const nx = dx / dist;
	const ny = dy / dist;
	for (let s = 0; s + dot_len <= dist; s += step) {
		gfx.moveTo(ax + nx * s, ay + ny * s);
		gfx.lineTo(ax + nx * (s + dot_len), ay + ny * (s + dot_len));
	}
	gfx.stroke({ width: 1, color: 0x44ff88, alpha: 0.7 });
};
