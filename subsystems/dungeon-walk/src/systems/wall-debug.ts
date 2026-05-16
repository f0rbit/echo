import type { Id, System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { Container, Text } from "pixi.js";
import { wall_c } from "../components.ts";
import { g } from "../grid.ts";

const N = 1;
const E = 2;
const S = 4;
const W = 8;

type Labels = { container: Container; labels: Map<Id, Text> };

export const make_wall_debug_system = (overlay: Container): System => {
	const state: Labels = { container: new Container(), labels: new Map() };
	state.container.label = "dw.wall_debug";
	state.container.zIndex = 1000;
	overlay.addChild(state.container);
	return w => {
		const cells = new Set<number>();
		const entries: Array<[Id, { cx: number; cy: number; x: number; y: number }]> = [];
		for (const [id, p] of w.query([pos_c, wall_c] as const).collect()) {
			const c = g.world_to_cell(p.x, p.y);
			cells.add(g.key(c.x, c.y));
			entries.push([id, { cx: c.x, cy: c.y, x: p.x, y: p.y }]);
		}
		const is_wall = (x: number, y: number): boolean =>
			!g.in_bounds(x, y) || cells.has(g.key(x, y));
		const seen = new Set<Id>();
		for (const [id, { cx, cy, x, y }] of entries) {
			seen.add(id);
			let mask = 0;
			if (is_wall(cx, cy - 1)) mask |= N;
			if (is_wall(cx + 1, cy)) mask |= E;
			if (is_wall(cx, cy + 1)) mask |= S;
			if (is_wall(cx - 1, cy)) mask |= W;
			const existing = state.labels.get(id);
			if (existing) {
				existing.text = String(mask);
				existing.position.set(x, y);
				continue;
			}
			const text = new Text({
				text: String(mask),
				style: {
					fontFamily: "monospace",
					fontSize: 8,
					fill: 0xffff00,
					stroke: { color: 0x000000, width: 2 },
				},
			});
			text.anchor.set(0.5, 0.5);
			text.position.set(x, y);
			state.container.addChild(text);
			state.labels.set(id, text);
		}
		for (const [id, text] of state.labels) {
			if (!seen.has(id)) {
				state.container.removeChild(text);
				text.destroy();
				state.labels.delete(id);
			}
		}
	};
};
