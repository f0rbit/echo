export type ShaderSet = {
	readonly vertex_glsl: string;
	readonly fragment_glsl: string;
	readonly wgsl: string;
};

const vertex_glsl = `in vec2 aPosition;
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

const fragment_glsl = `in vec2 vTextureCoord;

uniform sampler2D uTexture;
uniform highp vec4 uInputSize;

uniform sampler2D uLightGrid;
uniform highp vec3 uAmbient;
uniform highp vec2 uGridSize;

out vec4 finalColor;

void main() {
    vec4 col = texture(uTexture, vTextureCoord);
    vec2 grid_uv = (vTextureCoord * uInputSize.xy) / uGridSize;
    vec4 g = texture(uLightGrid, grid_uv);
    vec3 g_rgb = g.rgb * 4.0;
    vec3 unseen = uAmbient * col.rgb;
    vec3 lit_target = col.rgb * (uAmbient + g_rgb);
    float Y = max(lit_target.r, max(lit_target.g, lit_target.b));
    vec3 lit = lit_target / (1.0 + max(0.0, Y - 1.0));
    finalColor = vec4(mix(unseen, lit, g.a), col.a);
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
  uAmbient: vec3<f32>,
  _pad0: f32,
  uGridSize: vec2<f32>,
  _pad1: vec2<f32>,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> light: LightUniforms;
@group(1) @binding(1) var uLightGrid: texture_2d<f32>;
@group(1) @binding(2) var uLightGridSampler: sampler;

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
  let grid_uv = (uv * gfu.uInputSize.xy) / light.uGridSize;
  let g = textureSample(uLightGrid, uLightGridSampler, grid_uv);
  let g_rgb = g.rgb * 4.0;
  let unseen = light.uAmbient * col.rgb;
  let lit_target = col.rgb * (light.uAmbient + g_rgb);
  let Y = max(lit_target.r, max(lit_target.g, lit_target.b));
  let lit = lit_target / (1.0 + max(0.0, Y - 1.0));
  return vec4<f32>(mix(unseen, lit, g.a), col.a);
}`;

export const make_shaders = (): ShaderSet => ({
	vertex_glsl,
	fragment_glsl,
	wgsl,
});
