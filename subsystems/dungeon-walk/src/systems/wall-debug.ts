import type { Id, System, World } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { Text, TextStyle, Container } from "pixi.js";
import { wall_c } from "../components.ts";
import { g } from "../grid.ts";
import { PATTERN_TO_TILE } from "./wall-autotile.ts";

declare global {
	var echoWallDebug: ((on?: boolean) => boolean) | undefined;
}

const N = 1;
const E = 2;
const S = 4;
const W = 8;

const labels = new Map<Id, Text>();
let visible_state = false;

const compute_pattern = (cx: number, cy: number, cells: Set<number>): number => {
	const is_wall = (x: number, y: number): boolean =>
		!g.in_bounds(x, y) || cells.has(g.key(x, y));
	let mask = 0;
	if (is_wall(cx, cy - 1)) mask |= N;
	if (is_wall(cx + 1, cy)) mask |= E;
	if (is_wall(cx, cy + 1)) mask |= S;
	if (is_wall(cx - 1, cy)) mask |= W;
	return mask;
};

export const make_wall_debug_system = (container: Container): System => (w: World) => {
	const cells = new Set<number>();
	for (const [, p] of w.query([pos_c, wall_c] as const).collect()) {
		const c = g.world_to_cell(p.x, p.y);
		cells.add(g.key(c.x, c.y));
	}

	for (const [id, p] of w.query([pos_c, wall_c] as const).collect()) {
		if (labels.has(id)) continue;
		const c = g.world_to_cell(p.x, p.y);
		const pattern = compute_pattern(c.x, c.y, cells);
		const tile = PATTERN_TO_TILE[pattern]!;
		const text = new Text({
			text: `${pattern.toString(16).toUpperCase()}→${tile.col},${tile.row}`,
			style: new TextStyle({
				fontFamily: "monospace",
				fontSize: 10,
				fill: 0xffff00,
				stroke: { color: 0x000000, width: 1 },
			}),
		});
		text.anchor.set(0.5);
		text.position.set(p.x, p.y);
		text.visible = visible_state;
		text.zIndex = 1000;
		container.addChild(text);
		labels.set(id, text);
	}

	if (!globalThis.echoWallDebug) {
		globalThis.echoWallDebug = (on) => {
			visible_state = on === undefined ? !visible_state : on;
			for (const label of labels.values()) label.visible = visible_state;
			return visible_state;
		};
	}
};
