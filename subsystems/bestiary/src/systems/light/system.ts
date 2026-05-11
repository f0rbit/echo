import type { Component, Id, System } from "@f0rbit/forge";
import { Filter, GlProgram, GpuProgram, UniformGroup } from "pixi.js";
import { player_c, visual_pos_c } from "../../components.ts";
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

export type LightCone = {
	readonly dir: readonly [number, number];
	readonly inner_deg: number;
	readonly outer_deg: number;
};

export type LightSpec = {
	readonly pos_px: readonly [number, number];
	readonly color: readonly [number, number, number];
	readonly radius_px: number;
	readonly intensity: number;
	readonly falloff?: number;
	readonly cone?: LightCone;
	readonly flicker?: FlickerProfile;
};

export type LightSystemConfig = {
	readonly design: { readonly width: number; readonly height: number };
	readonly ambient?: readonly [number, number, number];
	readonly max_lights?: 8 | 16;
};

export type LightSystem = {
	readonly filter: Filter;
	readonly add: (spec: LightSpec) => LightHandle;
	readonly remove: (handle: LightHandle) => void;
	readonly set_pos: (handle: LightHandle, x: number, y: number) => void;
	readonly set_intensity: (handle: LightHandle, value: number) => void;
	readonly set_color: (handle: LightHandle, rgb: readonly [number, number, number]) => void;
	readonly set_ambient: (rgb: readonly [number, number, number]) => void;
	readonly update_uniforms: () => void;
};

type Slot = {
	pos_x: number;
	pos_y: number;
	radius: number;
	intensity: number;
	color_r: number;
	color_g: number;
	color_b: number;
	falloff: number;
	cone_dir_x: number;
	cone_dir_y: number;
	cone_cos_inner: number;
	cone_cos_outer: number;
	has_cone: boolean;
	flicker?: FlickerProfile;
	seed: number;
	handle: { id: number };
};

const default_ambient: readonly [number, number, number] = [0.04, 0.04, 0.08];
const sentinel: LightHandle = { id: -1 };

const time_providers = new WeakMap<LightSystem, () => number>();
let warned_exhaustion = false;

const normalize_cone = (cone: LightCone): { dir_x: number; dir_y: number; cos_inner: number; cos_outer: number } => {
	const [dx, dy] = cone.dir;
	const len = Math.hypot(dx, dy);
	const dir_x = len > 1e-6 ? dx / len : 1;
	const dir_y = len > 1e-6 ? dy / len : 0;
	let inner = Math.max(0, Math.min(180, cone.inner_deg));
	let outer = Math.max(0, Math.min(180, cone.outer_deg));
	if (inner > outer) {
		const t = inner;
		inner = outer;
		outer = t;
	}
	const cos_inner = Math.cos((inner * Math.PI) / 180);
	const cos_outer = Math.cos((outer * Math.PI) / 180);
	return { dir_x, dir_y, cos_inner, cos_outer };
};

const eval_flicker = (
	flicker: FlickerProfile | undefined,
	seed: number,
	t: number,
): { i_mul: number; r_mul: number } => {
	if (!flicker) return { i_mul: 1, r_mul: 1 };
	if (flicker.kind === "torch") {
		const out = torch_flicker(flicker.seed ?? seed, t, flicker.amount ?? 0.15);
		return { i_mul: out.intensity, r_mul: out.radius };
	}
	if (flicker.kind === "candle") {
		const out = candle_flicker(flicker.seed ?? seed, t, flicker.amount ?? 0.15);
		return { i_mul: out.intensity, r_mul: out.radius };
	}
	if (flicker.kind === "fluorescent") {
		return { i_mul: fluorescent_flicker(flicker.seed ?? seed, t), r_mul: 1 };
	}
	return { i_mul: sine_flicker(flicker.hz, flicker.amount, t), r_mul: 1 };
};

export const make_light_system = (config: LightSystemConfig): LightSystem => {
	const max_lights = config.max_lights ?? 16;
	const ambient_init = config.ambient ?? default_ambient;
	const shaders = make_shaders(max_lights);

	const lights_buf = new Float32Array(max_lights * 4);
	const colors_buf = new Float32Array(max_lights * 4);
	const cones_buf = new Float32Array(max_lights * 4);
	for (let i = 0; i < max_lights; i++) cones_buf[i * 4 + 2] = -2;
	const ambient_buf = new Float32Array([ambient_init[0], ambient_init[1], ambient_init[2]]);

	const uniforms = new UniformGroup({
		uAmbient: { value: ambient_buf, type: "vec3<f32>" as const },
		uCount: { value: 0, type: "i32" as const },
		uLights: { value: lights_buf, type: "vec4<f32>" as const, size: max_lights },
		uLightColors: { value: colors_buf, type: "vec4<f32>" as const, size: max_lights },
		uLightCones: { value: cones_buf, type: "vec4<f32>" as const, size: max_lights },
	});

	const filter = new Filter({
		glProgram: GlProgram.from({ vertex: shaders.vertex_glsl, fragment: shaders.fragment_glsl, name: "bst-light-multi" }),
		gpuProgram: GpuProgram.from({
			vertex: { source: shaders.wgsl, entryPoint: "mainVertex" },
			fragment: { source: shaders.wgsl, entryPoint: "mainFragment" },
		}),
		resources: { light: uniforms },
	});

	const slots: Slot[] = [];

	const add = (spec: LightSpec): LightHandle => {
		if (slots.length >= max_lights) {
			if (!warned_exhaustion) {
				console.warn(`[light] max_lights (${max_lights}) reached; dropping additional lights`);
				warned_exhaustion = true;
			}
			return sentinel;
		}
		const id = slots.length;
		const cone = spec.cone ? normalize_cone(spec.cone) : null;
		const seed = (id * 2654435761) | 0;
		const slot: Slot = {
			pos_x: spec.pos_px[0],
			pos_y: spec.pos_px[1],
			radius: spec.radius_px,
			intensity: spec.intensity,
			color_r: spec.color[0],
			color_g: spec.color[1],
			color_b: spec.color[2],
			falloff: spec.falloff ?? 1.4,
			cone_dir_x: cone ? cone.dir_x : 1,
			cone_dir_y: cone ? cone.dir_y : 0,
			cone_cos_inner: cone ? cone.cos_inner : -2,
			cone_cos_outer: cone ? cone.cos_outer : -2,
			has_cone: cone !== null,
			flicker: spec.flicker,
			seed,
			handle: { id },
		};
		slots.push(slot);
		return slot.handle;
	};

	const slot_of = (handle: LightHandle): Slot | null => {
		if (handle.id < 0 || handle.id >= slots.length) return null;
		return slots[handle.id] ?? null;
	};

	const remove = (handle: LightHandle): void => {
		if (handle.id < 0 || handle.id >= slots.length) return;
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

	const set_pos = (handle: LightHandle, x: number, y: number): void => {
		const s = slot_of(handle);
		if (!s) return;
		s.pos_x = x;
		s.pos_y = y;
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

	const update_uniforms = (): void => {
		const time_provider = time_providers.get(api) ?? ((): number => 0);
		const t = time_provider();
		const count = slots.length;
		for (let i = 0; i < count; i++) {
			const s = slots[i]!;
			const f = eval_flicker(s.flicker, s.seed, t);
			const intensity = s.intensity * f.i_mul;
			const radius = s.radius * f.r_mul;
			const o = i * 4;
			lights_buf[o] = s.pos_x;
			lights_buf[o + 1] = s.pos_y;
			lights_buf[o + 2] = radius;
			lights_buf[o + 3] = intensity;
			colors_buf[o] = s.color_r;
			colors_buf[o + 1] = s.color_g;
			colors_buf[o + 2] = s.color_b;
			colors_buf[o + 3] = s.falloff;
			cones_buf[o] = s.cone_dir_x;
			cones_buf[o + 1] = s.cone_dir_y;
			cones_buf[o + 2] = s.has_cone ? s.cone_cos_inner : -2;
			cones_buf[o + 3] = s.has_cone ? s.cone_cos_outer : -2;
		}
		(uniforms.uniforms as { uCount: number }).uCount = count;
		uniforms.update();
	};

	const api: LightSystem = {
		filter,
		add,
		remove,
		set_pos,
		set_intensity,
		set_color,
		set_ambient,
		update_uniforms,
	};
	return api;
};

/**
 * Driver system: writes the current set of light slots into the filter's
 * UniformGroup. MUST be registered on the `"render"` stage — flicker reads
 * `ctx.time.alpha` and never writes to world or resources, so it cannot
 * affect simulation determinism.
 */
export const light_uniforms_system = (ls: LightSystem): System => (_w, ctx) => {
	if (!time_providers.has(ls)) {
		time_providers.set(ls, () => (ctx.time.tick + ctx.time.alpha) * ctx.time.fixed_dt);
	}
	ls.update_uniforms();
};

export const player_light_follow_system = (
	ls: LightSystem,
	handle: LightHandle,
): System => (w, _ctx) => {
	const players = w.query([visual_pos_c, player_c] as const).collect();
	if (players.length === 0) return;
	const vis = players[0]![1];
	ls.set_pos(handle, vis.x, vis.y);
};

export const make_light_follow_system = <P extends { x: number; y: number }>(
	ls: LightSystem,
	handle: LightHandle,
	entity_id: Id,
	pos_component: Component<P>,
): System => (w, _ctx) => {
	const p = w.get(entity_id, pos_component);
	if (!p.ok) return;
	ls.set_pos(handle, p.value.x, p.value.y);
};

export const make_marker_light_follow_system = <M, P extends { x: number; y: number }>(
	ls: LightSystem,
	handle: LightHandle,
	marker: Component<M>,
	pos_component: Component<P>,
): System => (w, _ctx) => {
	const list = w.query([pos_component, marker] as const).collect();
	if (list.length === 0) return;
	const p = list[0]![1] as P;
	ls.set_pos(handle, p.x, p.y);
};
