import type { Component, Ctx, Id, System, World } from "@f0rbit/forge";
import type { Cell, Grid } from "@f0rbit/forge/grid";
import {
	BufferImageSource,
	Filter,
	GlProgram,
	GpuProgram,
	UniformGroup,
} from "pixi.js";
import {
	candle_flicker,
	fluorescent_flicker,
	sine_flicker,
	torch_flicker,
} from "./flicker.ts";
import { make_shaders } from "./shaders.ts";

export type LightHandle = { readonly id: number };

export type FlickerProfile =
	| { kind: "torch"; amount?: number; seed?: number }
	| { kind: "candle"; amount?: number; seed?: number }
	| { kind: "fluorescent"; seed?: number }
	| { kind: "sine"; hz: number; amount: number };

export type LightSpec = {
	readonly pos_cell: readonly [number, number];
	readonly color: readonly [number, number, number];
	readonly radius_cells: number;
	readonly intensity: number;
	readonly falloff?: number;
	readonly flicker?: FlickerProfile;
};

export type LightSystemConfig = {
	readonly grid: Grid;
	readonly ambient?: readonly [number, number, number];
	readonly eye_radius?: number;
};

export type LightSystem = {
	readonly filter: Filter;
	readonly eye_handle: LightHandle;
	readonly add: (spec: LightSpec) => LightHandle;
	readonly remove: (handle: LightHandle) => void;
	readonly set_pos: (handle: LightHandle, cell_x: number, cell_y: number) => void;
	readonly set_intensity: (handle: LightHandle, value: number) => void;
	readonly set_color: (handle: LightHandle, rgb: readonly [number, number, number]) => void;
	readonly set_ambient: (rgb: readonly [number, number, number]) => void;
	readonly update: (
		ctx: { time: { tick: number; alpha: number; fixed_dt: number } },
		is_blocking: (cell: Cell) => boolean,
	) => void;
};

type Slot = {
	pos_cx: number;
	pos_cy: number;
	radius_cells: number;
	intensity: number;
	color_r: number;
	color_g: number;
	color_b: number;
	falloff: number;
	flicker?: FlickerProfile;
	seed: number;
	is_eye: boolean;
	dirty: boolean;
	cells_reached: ReadonlySet<number> | null;
	handle: { id: number };
};

const default_ambient: readonly [number, number, number] = [0.04, 0.04, 0.08];

const eval_flicker = (
	flicker: FlickerProfile | undefined,
	seed: number,
	t: number,
): number => {
	if (!flicker) return 1;
	if (flicker.kind === "torch") return torch_flicker(flicker.seed ?? seed, t, flicker.amount ?? 0.15).intensity;
	if (flicker.kind === "candle") return candle_flicker(flicker.seed ?? seed, t, flicker.amount ?? 0.15).intensity;
	if (flicker.kind === "fluorescent") return fluorescent_flicker(flicker.seed ?? seed, t);
	return sine_flicker(flicker.hz, flicker.amount, t);
};

const euclidean = (ax: number, ay: number, bx: number, by: number): number =>
	Math.hypot(ax - bx, ay - by);

export const make_light_system = (config: LightSystemConfig): LightSystem => {
	const g = config.grid;
	const cols = g.cols;
	const rows = g.rows;
	const tile = g.tile;
	const eye_radius = config.eye_radius ?? 6;
	const ambient_init = config.ambient ?? default_ambient;
	const shaders = make_shaders();

	const clamp_cell = (x: number, y: number): [number, number] => [
		Math.max(0, Math.min(cols - 1, x | 0)),
		Math.max(0, Math.min(rows - 1, y | 0)),
	];

	const grid_buf = new Float32Array(cols * rows * 4);

	const tex_source = new BufferImageSource({
		resource: grid_buf,
		width: cols,
		height: rows,
		format: "rgba32float",
		alphaMode: "no-premultiply-alpha",
		scaleMode: "linear",
		addressModeU: "clamp-to-edge",
		addressModeV: "clamp-to-edge",
	});

	const ambient_buf = new Float32Array([ambient_init[0], ambient_init[1], ambient_init[2]]);
	const grid_size_buf = new Float32Array([cols * tile, rows * tile]);

	const uniforms = new UniformGroup({
		uAmbient: { value: ambient_buf, type: "vec3<f32>" as const },
		uGridSize: { value: grid_size_buf, type: "vec2<f32>" as const },
	});

	const filter = new Filter({
		glProgram: GlProgram.from({ vertex: shaders.vertex_glsl, fragment: shaders.fragment_glsl, name: "bst-light-grid" }),
		gpuProgram: GpuProgram.from({
			vertex: { source: shaders.wgsl, entryPoint: "mainVertex" },
			fragment: { source: shaders.wgsl, entryPoint: "mainFragment" },
		}),
		resources: { light: uniforms, uLightGrid: tex_source },
	});

	const slots: Slot[] = [];

	const make_slot = (spec: LightSpec, is_eye: boolean): Slot => {
		const [cx, cy] = clamp_cell(spec.pos_cell[0], spec.pos_cell[1]);
		const id = slots.length;
		return {
			pos_cx: cx,
			pos_cy: cy,
			radius_cells: spec.radius_cells,
			intensity: spec.intensity,
			color_r: spec.color[0],
			color_g: spec.color[1],
			color_b: spec.color[2],
			falloff: spec.falloff ?? 1.4,
			flicker: spec.flicker,
			seed: (id * 2654435761) | 0,
			is_eye,
			dirty: true,
			cells_reached: null,
			handle: { id },
		};
	};

	const eye_slot = make_slot(
		{ pos_cell: [0, 0], color: [0, 0, 0], radius_cells: eye_radius, intensity: 0 },
		true,
	);
	slots.push(eye_slot);
	const eye_handle: LightHandle = eye_slot.handle;

	const add = (spec: LightSpec): LightHandle => {
		const slot = make_slot(spec, false);
		slots.push(slot);
		return slot.handle;
	};

	const slot_of = (handle: LightHandle): Slot | null => {
		if (handle.id < 0 || handle.id >= slots.length) return null;
		return slots[handle.id] ?? null;
	};

	const remove = (handle: LightHandle): void => {
		if (handle.id <= 0 || handle.id >= slots.length) return;
		const last = slots.length - 1;
		if (handle.id === last) {
			slots.pop();
			return;
		}
		const moved = slots[last]!;
		moved.handle.id = handle.id;
		slots[handle.id] = moved;
		slots.pop();
	};

	const set_pos = (handle: LightHandle, cell_x: number, cell_y: number): void => {
		const s = slot_of(handle);
		if (!s) return;
		const [cx, cy] = clamp_cell(cell_x, cell_y);
		if (s.pos_cx === cx && s.pos_cy === cy && s.cells_reached !== null) return;
		s.pos_cx = cx;
		s.pos_cy = cy;
		s.dirty = true;
	};

	const set_intensity = (handle: LightHandle, value: number): void => {
		const s = slot_of(handle);
		if (!s) return;
		s.intensity = value;
	};

	const set_color = (handle: LightHandle, rgb: readonly [number, number, number]): void => {
		const s = slot_of(handle);
		if (!s) return;
		s.color_r = rgb[0];
		s.color_g = rgb[1];
		s.color_b = rgb[2];
	};

	const set_ambient = (rgb: readonly [number, number, number]): void => {
		ambient_buf[0] = rgb[0];
		ambient_buf[1] = rgb[1];
		ambient_buf[2] = rgb[2];
		uniforms.update();
	};

	const recompute_cells_reached = (s: Slot, is_blocking: (cell: Cell) => boolean): void => {
		const los = g.line_of_sight({
			from: { x: s.pos_cx, y: s.pos_cy },
			radius: s.radius_cells,
			is_blocking,
			include_origin: true,
		});
		const r = s.radius_cells;
		const circular = new Set<number>();
		for (const k of los) {
			const c = g.unkey(k);
			if (euclidean(c.x, c.y, s.pos_cx, s.pos_cy) <= r) circular.add(k);
		}
		s.cells_reached = circular;
		s.dirty = false;
	};

	const update = (
		ctx: { time: { tick: number; alpha: number; fixed_dt: number } },
		is_blocking: (cell: Cell) => boolean,
	): void => {
		grid_buf.fill(0);
		const t = (ctx.time.tick + ctx.time.alpha) * ctx.time.fixed_dt;
		for (let i = 0; i < slots.length; i++) {
			const s = slots[i]!;
			if (s.dirty || s.cells_reached === null) recompute_cells_reached(s, is_blocking);
			const reached = s.cells_reached;
			if (!reached) continue;
			if (s.is_eye) {
				for (const k of reached) grid_buf[k * 4 + 3] = 1.0;
				continue;
			}
			const i_mul = eval_flicker(s.flicker, s.seed, t);
			const contrib_base = s.intensity * i_mul;
			const r = s.radius_cells;
			const inv_r = r > 0 ? 1 / r : 0;
			const exp = s.falloff;
			for (const k of reached) {
				const c = g.unkey(k);
				const d = euclidean(c.x, c.y, s.pos_cx, s.pos_cy);
				const tt = Math.min(1, d * inv_r);
				const ttp = Math.pow(tt, exp);
				const fall = 1 - (ttp * ttp * (3 - 2 * ttp));
				const contrib = contrib_base * fall;
				const o = k * 4;
				grid_buf[o] = (grid_buf[o] ?? 0) + s.color_r * contrib;
				grid_buf[o + 1] = (grid_buf[o + 1] ?? 0) + s.color_g * contrib;
				grid_buf[o + 2] = (grid_buf[o + 2] ?? 0) + s.color_b * contrib;
			}
		}
		tex_source.update();
	};

	return {
		filter,
		eye_handle,
		add,
		remove,
		set_pos,
		set_intensity,
		set_color,
		set_ambient,
		update,
	};
};

export const make_light_update_system = (
	ls: LightSystem,
	resolve_is_blocking: (w: World, ctx: Ctx) => ((cell: Cell) => boolean) | null,
): System => (w, ctx) => {
	const is_blocking = resolve_is_blocking(w, ctx);
	if (!is_blocking) return;
	ls.update(ctx, is_blocking);
};

export const make_eye_follow_system = <P extends { x: number; y: number }>(
	ls: LightSystem,
	grid: Grid,
	pos_component: Component<P>,
	player_marker: Component<true>,
): System => (w, _ctx) => {
	const list = w.query([pos_component, player_marker] as const).collect();
	if (list.length === 0) return;
	const p = list[0]![1] as P;
	const cell = grid.world_to_cell(p.x, p.y);
	ls.set_pos(ls.eye_handle, cell.x, cell.y);
};

export const make_light_follow_system = <P extends { x: number; y: number }>(
	ls: LightSystem,
	grid: Grid,
	handle: LightHandle,
	entity_id: Id,
	pos_component: Component<P>,
): System => (w, _ctx) => {
	const p = w.get(entity_id, pos_component);
	if (!p.ok) return;
	const cell = grid.world_to_cell(p.value.x, p.value.y);
	ls.set_pos(handle, cell.x, cell.y);
};

export const make_marker_light_follow_system = <M, P extends { x: number; y: number }>(
	ls: LightSystem,
	grid: Grid,
	handle: LightHandle,
	marker: Component<M>,
	pos_component: Component<P>,
): System => (w, _ctx) => {
	const list = w.query([pos_component, marker] as const).collect();
	if (list.length === 0) return;
	const p = list[0]![1] as P;
	const cell = grid.world_to_cell(p.x, p.y);
	ls.set_pos(handle, cell.x, cell.y);
};
