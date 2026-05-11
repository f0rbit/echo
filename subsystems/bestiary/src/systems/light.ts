import type { System } from "@f0rbit/forge";
import { Filter, GlProgram, GpuProgram, UniformGroup } from "pixi.js";
import { player_c, visual_pos_c } from "../components.ts";
import { g } from "../grid.ts";
import { fov_radius } from "./fov.ts";

const fragment = `in vec2 vTextureCoord;

uniform sampler2D uTexture;
uniform highp vec4 uInputSize;

uniform highp vec2 uPlayerPx;
uniform highp vec2 uDesignPx;
uniform highp float uRadiusPx;
uniform highp vec3 uAmbient;
uniform highp float uFalloff;

out vec4 finalColor;

void main() {
    vec4 col = texture(uTexture, vTextureCoord);

    vec2 px = vTextureCoord * uInputSize.xy;

    vec2 d = px - uPlayerPx;
    float dist = length(d);
    float t = clamp(dist / uRadiusPx, 0.0, 1.0);

    float intensity = 1.0 - smoothstep(0.0, 1.0, pow(t, uFalloff));

    vec3 lit = mix(uAmbient * col.rgb, col.rgb, intensity);
    finalColor = vec4(lit, col.a);
}`;

const vertex = `in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition() {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord() {
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main() {
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}`;

const wgsl = `struct GlobalFilterUniforms {
  uInputSize: vec4<f32>,
  uInputPixel: vec4<f32>,
  uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>,
  uGlobalFrame: vec4<f32>,
  uOutputTexture: vec4<f32>,
};

struct LightUniforms {
  uPlayerPx: vec2<f32>,
  uDesignPx: vec2<f32>,
  uRadiusPx: f32,
  uFalloff: f32,
  uAmbient: vec3<f32>,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> light: LightUniforms;

struct VSOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

fn filterVertexPosition(aPosition: vec2<f32>) -> vec4<f32> {
  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

fn filterTextureCoord(aPosition: vec2<f32>) -> vec2<f32> {
  return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}

@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {
  return VSOutput(filterVertexPosition(aPosition), filterTextureCoord(aPosition));
}

@fragment
fn mainFragment(@location(0) uv: vec2<f32>, @builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let col = textureSample(uTexture, uSampler, uv);
  let px = uv * gfu.uInputSize.xy;
  let d = px - light.uPlayerPx;
  let dist = length(d);
  let t = clamp(dist / light.uRadiusPx, 0.0, 1.0);
  let intensity = 1.0 - smoothstep(0.0, 1.0, pow(t, light.uFalloff));
  let lit = mix(light.uAmbient * col.rgb, col.rgb, intensity);
  return vec4(lit, col.a);
}`;

export type LightFilter = {
	filter: Filter;
	uniforms: UniformGroup<{
		uPlayerPx: { value: Float32Array; type: "vec2<f32>" };
		uDesignPx: { value: Float32Array; type: "vec2<f32>" };
		uRadiusPx: { value: number; type: "f32" };
		uFalloff: { value: number; type: "f32" };
		uAmbient: { value: Float32Array; type: "vec3<f32>" };
	}>;
};

export type LightPalette = {
	ambient?: readonly [number, number, number];
	falloff?: number;
	radius_px?: number;
};

export const make_light_filter = (
	design: { width: number; height: number },
	palette: LightPalette = {},
): LightFilter => {
	const ambient = palette.ambient ?? [0.04, 0.04, 0.08] as const;
	const falloff = palette.falloff ?? 1.4;
	const radius_px = palette.radius_px ?? fov_radius * g.tile;
	const uniforms = new UniformGroup({
		uPlayerPx: { value: new Float32Array([design.width / 2, design.height / 2]), type: "vec2<f32>" as const },
		uDesignPx: { value: new Float32Array([design.width, design.height]), type: "vec2<f32>" as const },
		uRadiusPx: { value: radius_px, type: "f32" as const },
		uFalloff: { value: falloff, type: "f32" as const },
		uAmbient: { value: new Float32Array([ambient[0], ambient[1], ambient[2]]), type: "vec3<f32>" as const },
	});
	const filter = new Filter({
		glProgram: GlProgram.from({ vertex, fragment, name: "bst-light-filter" }),
		gpuProgram: GpuProgram.from({
			vertex: { source: wgsl, entryPoint: "mainVertex" },
			fragment: { source: wgsl, entryPoint: "mainFragment" },
		}),
		resources: { light: uniforms },
	});
	return { filter, uniforms };
};

export const light_follow_system = (light: LightFilter): System => (w, _ctx) => {
	const players = w.query([visual_pos_c, player_c] as const).collect();
	if (players.length === 0) return;
	const vis = players[0]![1];
	light.uniforms.uniforms.uPlayerPx[0] = vis.x;
	light.uniforms.uniforms.uPlayerPx[1] = vis.y;
};
