import type { Id, System, World } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import type { Container } from "pixi.js";
import { Graphics } from "pixi.js";
import { sprite_c } from "@f0rbit/forge/pixi";
import { wall_c } from "../components.ts";
import { g } from "../grid.ts";
import { PATTERN_TO_TILE } from "./wall-autotile.ts";

declare global {
	var echoWallDebug: ((on?: boolean) => boolean) | undefined;
	var echoWallClick: ((on?: boolean) => boolean) | undefined;
}

const N = 1;
const E = 2;
const S = 4;
const W = 8;

const PATTERN_COLORS: Record<number, { color: number; name: string }> = {
	0x0: { color: 0xffffff, name: "isolated" },
	0x1: { color: 0xff5555, name: "N only" },
	0x2: { color: 0x55ff55, name: "E only" },
	0x3: { color: 0xff8800, name: "NE (corner SW-open)" },
	0x4: { color: 0x5555ff, name: "S only" },
	0x5: { color: 0xaa00ff, name: "NS (vertical)" },
	0x6: { color: 0x00ddff, name: "ES (corner NW-open)" },
	0x7: { color: 0x880000, name: "NES (T-W edge)" },
	0x8: { color: 0xffff00, name: "W only" },
	0x9: { color: 0xff00ff, name: "NW (corner SE-open)" },
	0xa: { color: 0x00ffff, name: "EW (horizontal)" },
	0xb: { color: 0x008800, name: "NEW (T-S edge top)" },
	0xc: { color: 0xff66bb, name: "SW (corner NE-open)" },
	0xd: { color: 0x000088, name: "NSW (T-E edge left)" },
	0xe: { color: 0x888800, name: "ESW (T-N edge bottom)" },
	0xf: { color: 0x888888, name: "NESW (4-way / interior)" },
};

const PATTERN_NAMES: Record<number, string> = {
	0x0: "isolated",
	0x1: "N only",
	0x2: "E only",
	0x3: "NE (corner SW-open)",
	0x4: "S only",
	0x5: "NS (vertical)",
	0x6: "ES (corner NW-open)",
	0x7: "NES (T-W edge)",
	0x8: "W only",
	0x9: "NW (corner SE-open)",
	0xa: "EW (horizontal)",
	0xb: "NEW (T-S edge top)",
	0xc: "SW (corner NE-open)",
	0xd: "NSW (T-E edge left)",
	0xe: "ESW (T-N edge bottom)",
	0xf: "NESW (4-way / interior)",
};

const wall_pattern = new Map<Id, number>();
const wall_click_index = new Map<Id, number>();
const cell_to_id = new Map<number, Id>();
let active_world: World | null = null;
let active_canvas: HTMLCanvasElement | null = null;
let active_debug_container: Container | null = null;
let visible_state = false;
let click_state = false;

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

const apply_tints = (on: boolean): void => {
	if (!active_world) return;
	for (const [id, pattern] of wall_pattern) {
		const tint = on ? PATTERN_COLORS[pattern]!.color : 0xffffff;
		const r = active_world.get(id, sprite_c);
		if (r.ok) {
			active_world.set(id, sprite_c, { ...r.value, tint });
		}
	}
};

const draw_click_marker_at_canvas = (cx: number, cy: number): void => {
	if (!active_debug_container) return;
	const dot = new Graphics();
	dot.circle(0, 0, 4).fill({ color: 0xff00ff });
	dot.circle(0, 0, 8).stroke({ color: 0xffff00, width: 2 });
	dot.position.set(cx, cy);
	dot.zIndex = 9999;
	active_debug_container.addChild(dot);
	setTimeout(() => {
		dot.removeFromParent();
		dot.destroy();
	}, 2000);
};

const handle_click = (id: Id): void => {
	if (!active_world) return;
	const pattern = wall_pattern.get(id);
	if (pattern === undefined) return;
	const next_index = (wall_click_index.get(id) ?? -1) + 1;
	wall_click_index.set(id, next_index);
	const col = next_index % 12;
	const row = Math.floor(next_index / 12) % 4;
	const default_tile = PATTERN_TO_TILE[pattern]!;
	const r = active_world.get(id, sprite_c);
	if (r.ok) {
		active_world.set(id, sprite_c, { ...r.value, frame: `wat_${col}_${row}` });
	}
	console.log(
		`click: pattern=0x${pattern.toString(16).toUpperCase()} (${PATTERN_NAMES[pattern]}) → tile (${col},${row}) [default was (${default_tile.col},${default_tile.row})]`
	);
};

const on_dom_click = (e: PointerEvent): void => {
	if (!click_state || !active_world || !active_canvas || !active_debug_container) return;
	const rect = active_canvas.getBoundingClientRect();
	const css_x = e.clientX - rect.left;
	const css_y = e.clientY - rect.top;
	const canvas_x = css_x * (active_canvas.width / rect.width);
	const canvas_y = css_y * (active_canvas.height / rect.height);

	// Manual fit_scale inverse — fit world into canvas with centered letterbox
	const world_px_w = g.cols * g.tile;
	const world_px_h = g.rows * g.tile;
	const fit_scale = Math.min(active_canvas.width / world_px_w, active_canvas.height / world_px_h);
	const offset_x = (active_canvas.width - world_px_w * fit_scale) / 2;
	const offset_y = (active_canvas.height - world_px_h * fit_scale) / 2;

	// Empirical offset that aligned cell lookup last time it worked
	const wx = (canvas_x - offset_x) / fit_scale + g.tile / 2;
	const wy = (canvas_y - offset_y) / fit_scale + g.tile;

	const cell = g.world_to_cell(wx, wy);

	// Draw dot at LITERAL CLICK POSITION (canvas coords) — always at user's click
	draw_click_marker_at_canvas(canvas_x, canvas_y);

	console.log(`click: canvas(${canvas_x.toFixed(0)},${canvas_y.toFixed(0)}) → world(${wx.toFixed(1)},${wy.toFixed(1)}) → cell(${cell.x},${cell.y}) [fit_scale=${fit_scale.toFixed(2)}, offset=(${offset_x.toFixed(0)},${offset_y.toFixed(0)})]`);

	if (!g.in_bounds(cell.x, cell.y)) return;
	const id = cell_to_id.get(g.key(cell.x, cell.y));
	if (id === undefined) {
		console.log(`  → no wall at cell(${cell.x},${cell.y})`);
		return;
	}
	handle_click(id);
};

const apply_interactivity = (on: boolean): void => {
	if (!active_canvas) return;
	active_canvas.removeEventListener("pointerdown", on_dom_click);
	if (on) {
		active_canvas.addEventListener("pointerdown", on_dom_click);
	}
};

export const make_wall_debug_system = (
	world_container: Container,
	debug_container: Container,
): System => (w: World) => {
	active_world = w;
	active_debug_container = debug_container;
	active_canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
	const cells = new Set<number>();
	for (const [, p] of w.query([pos_c, wall_c] as const).collect()) {
		const c = g.world_to_cell(p.x, p.y);
		cells.add(g.key(c.x, c.y));
	}

	for (const [id, p] of w.query([pos_c, wall_c] as const).collect()) {
		const c = g.world_to_cell(p.x, p.y);
		const k = g.key(c.x, c.y);
		const pattern = compute_pattern(c.x, c.y, cells);
		wall_pattern.set(id, pattern);
		cell_to_id.set(k, id);
	}

	if (!globalThis.echoWallDebug) {
		globalThis.echoWallDebug = (on) => {
			visible_state = on === undefined ? !visible_state : on;
			apply_tints(visible_state);
			if (visible_state) {
				console.log("Wall pattern legend:");
				console.table(
					Object.entries(PATTERN_COLORS).map(([p, v]) => ({
						hex: p,
						color: "#" + v.color.toString(16).padStart(6, "0"),
						name: v.name,
					}))
				);
			}
			return visible_state;
		};
	}

	if (!globalThis.echoWallClick) {
		globalThis.echoWallClick = (on) => {
			click_state = on === undefined ? !click_state : on;
			apply_interactivity(click_state);
			if (click_state) {
				console.log("Wall click cycling ON. Click any wall to cycle through 48 tiles.");
				console.log("Toggle off with echoWallClick(false). Patterns + colors via echoWallDebug(true).");
			}
			return click_state;
		};
	}
};
