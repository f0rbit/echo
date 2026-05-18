import type { Id, System, World } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import type { Container } from "pixi.js";
import { Graphics } from "pixi.js";
import type { Camera } from "@f0rbit/forge/pixi";
import { event_to_world, sprite_c } from "@f0rbit/forge/pixi";
import { wall_c } from "../components.ts";
import { g } from "../grid.ts";
import { LOOKUP, compute_corner_states } from "@f0rbit/forge/autotile";

declare global {
	var echoWallDebug: ((on?: boolean) => boolean) | undefined;
	var echoWallClick: ((on?: boolean) => boolean) | undefined;
}

const STATE_NAMES = ["outer", "side-A", "side-B", "concave", "filled"] as const;

const tile_index = (col: number, row: number): number => row * 12 + col;

const TILE_COLOR_PALETTE: ReadonlyArray<number> = [
	0xff5555, 0x55ff55, 0x5555ff, 0xff8800, 0xaa00ff, 0x00ddff, 0x880000, 0xffff00,
	0xff00ff, 0x00ffff, 0x008800, 0xff66bb, 0x000088, 0x888800, 0x888888, 0xffffff,
	0xff3366, 0x33ff66, 0x3366ff, 0xffaa33, 0xaa33ff, 0x33aaff, 0xaa3333, 0xffff33,
	0xff66ff, 0x66ffff, 0x33aa33, 0xff99cc, 0x222288, 0xaaaa33, 0xaaaaaa, 0xffcc88,
	0xcc8855, 0x88cc55, 0x5588cc, 0xcc55aa, 0xaacc55, 0x55ccaa, 0xaa55cc, 0xccaa55,
	0x884422, 0x224488, 0x448822, 0x882244, 0x224422, 0x442288, 0x886622,
];

type Bits = { tl: number; tr: number; bl: number; br: number };
const wall_states = new Map<Id, Bits>();
const wall_click_index = new Map<Id, number>();
const cell_to_id = new Map<number, Id>();
let active_world: World | null = null;
let active_canvas: HTMLCanvasElement | null = null;
let active_debug_container: Container | null = null;
let active_camera: Camera | null = null;
let visible_state = false;
let click_state = false;

const apply_tints = (on: boolean): void => {
	if (!active_world) return;
	for (const [id, s] of wall_states) {
		const tile = LOOKUP[`${s.tl},${s.tr},${s.bl},${s.br}` as const];
		const idx = tile ? tile_index(tile.col, tile.row) % TILE_COLOR_PALETTE.length : 0;
		const tint = on ? TILE_COLOR_PALETTE[idx]! : 0xffffff;
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
	const s = wall_states.get(id);
	if (!s) return;
	const next_index = (wall_click_index.get(id) ?? -1) + 1;
	wall_click_index.set(id, next_index);
	const col = next_index % 12;
	const row = Math.floor(next_index / 12) % 4;
	const default_tile = LOOKUP[`${s.tl},${s.tr},${s.bl},${s.br}` as const]!;
	const r = active_world.get(id, sprite_c);
	if (r.ok) {
		active_world.set(id, sprite_c, { ...r.value, frame: `wat_${col}_${row}` });
	}
	const state_str = `[${STATE_NAMES[s.tl]},${STATE_NAMES[s.tr]},${STATE_NAMES[s.bl]},${STATE_NAMES[s.br]}]`;
	console.log(
		`click: corner_states ${state_str} → tile (${col},${row}) [default was (${default_tile.col},${default_tile.row})]`
	);
};

const on_dom_click = (e: PointerEvent): void => {
	if (!click_state || !active_world || !active_canvas || !active_debug_container || !active_camera) return;
	const world = event_to_world(e, active_canvas, active_camera);
	const cell = g.world_to_cell(world.x, world.y);
	const rect = active_canvas.getBoundingClientRect();
	draw_click_marker_at_canvas(e.clientX - rect.left, e.clientY - rect.top);
	if (!g.in_bounds(cell.x, cell.y)) {
		console.log(`click oob: world(${world.x.toFixed(1)},${world.y.toFixed(1)}) → cell(${cell.x},${cell.y})`);
		return;
	}
	const id = cell_to_id.get(g.key(cell.x, cell.y));
	if (id === undefined) {
		console.log(`click: world(${world.x.toFixed(1)},${world.y.toFixed(1)}) → cell(${cell.x},${cell.y}) — no wall`);
		return;
	}
	console.log(`click: world(${world.x.toFixed(1)},${world.y.toFixed(1)}) → cell(${cell.x},${cell.y})`);
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
	_world_container: Container,
	debug_container: Container,
	cam: Camera,
): System => (w: World) => {
	active_world = w;
	active_debug_container = debug_container;
	active_camera = cam;
	active_canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
	const cells = new Set<number>();
	for (const [, p] of w.query([pos_c, wall_c] as const).collect()) {
		const c = g.world_to_cell(p.x, p.y);
		cells.add(g.key(c.x, c.y));
	}
	const is_wall = (x: number, y: number): boolean =>
		!g.in_bounds(x, y) || cells.has(g.key(x, y));

	for (const [id, p] of w.query([pos_c, wall_c] as const).collect()) {
		const c = g.world_to_cell(p.x, p.y);
		const k = g.key(c.x, c.y);
		wall_states.set(id, compute_corner_states(c.x, c.y, is_wall));
		cell_to_id.set(k, id);
	}

	if (!globalThis.echoWallDebug) {
		globalThis.echoWallDebug = (on) => {
			visible_state = on === undefined ? !visible_state : on;
			apply_tints(visible_state);
			if (visible_state) {
				console.log("Wall debug: tinted by autotile sheet position (47 unique tiles).");
				console.log("Corner states: 0=outer, 1=side-A(vertical only), 2=side-B(horizontal only), 3=concave, 4=filled.");
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
				console.log("Toggle off with echoWallClick(false). Tints via echoWallDebug(true).");
			}
			return click_state;
		};
	}
};
