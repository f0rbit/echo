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

const make_fragment_glsl = (n: number): string => `in vec2 vTextureCoord;

uniform sampler2D uTexture;
uniform highp vec4 uInputSize;

uniform highp vec3 uAmbient;
uniform highp int uCount;
uniform highp vec4 uLights[${n}];
uniform highp vec4 uLightColors[${n}];
uniform highp vec4 uLightCones[${n}];

out vec4 finalColor;

void main() {
    vec4 col = texture(uTexture, vTextureCoord);
    vec2 px = vTextureCoord * uInputSize.xy;
    vec3 sum = vec3(0.0);
    for (int i = 0; i < ${n}; i++) {
        if (i >= uCount) break;
        vec4 L = uLights[i];
        vec4 C = uLightColors[i];
        vec4 D = uLightCones[i];
        vec2 d = px - L.xy;
        float dist = length(d);
        float t = clamp(dist / L.z, 0.0, 1.0);
        float fall = 1.0 - smoothstep(0.0, 1.0, pow(t, C.a));
        float cone = 1.0;
        if (D.z >= -1.0) {
            vec2 to_pixel = (dist > 0.0001) ? d / dist : vec2(1.0, 0.0);
            float ang_cos = dot(D.xy, to_pixel);
            cone = smoothstep(D.w, D.z, ang_cos);
        }
        sum += C.rgb * (L.w * fall * cone);
    }
    vec3 lit_target = col.rgb * (uAmbient + sum);
    vec3 ambient_only = uAmbient * col.rgb;
    vec3 lit = max(ambient_only, lit_target);
    float Y = max(lit.r, max(lit.g, lit.b));
    vec3 mapped = lit / (1.0 + Y);
    vec3 final = mapped * (1.0 + Y * 0.5);
    finalColor = vec4(final, col.a);
}`;

const make_wgsl = (n: number): string => `struct GlobalFilterUniforms {
  uInputSize: vec4<f32>,
  uInputPixel: vec4<f32>,
  uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>,
  uGlobalFrame: vec4<f32>,
  uOutputTexture: vec4<f32>,
};

struct LightUniforms {
  uAmbient: vec3<f32>,
  uCount: i32,
  uLights:      array<vec4<f32>, ${n}>,
  uLightColors: array<vec4<f32>, ${n}>,
  uLightCones:  array<vec4<f32>, ${n}>,
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
  var sum = vec3<f32>(0.0, 0.0, 0.0);
  for (var i: i32 = 0; i < ${n}; i = i + 1) {
    if (i >= light.uCount) { break; }
    let L = light.uLights[i];
    let C = light.uLightColors[i];
    let D = light.uLightCones[i];
    let d = px - L.xy;
    let dist = length(d);
    let t = clamp(dist / L.z, 0.0, 1.0);
    let fall = 1.0 - smoothstep(0.0, 1.0, pow(t, C.a));
    var cone = 1.0;
    if (D.z >= -1.0) {
      let to_pixel = select(vec2<f32>(1.0, 0.0), d / dist, dist > 0.0001);
      let ang_cos = dot(D.xy, to_pixel);
      cone = smoothstep(D.w, D.z, ang_cos);
    }
    sum = sum + C.rgb * (L.w * fall * cone);
  }
  let lit_target = col.rgb * (light.uAmbient + sum);
  let ambient_only = light.uAmbient * col.rgb;
  let lit = max(ambient_only, lit_target);
  let Y = max(lit.r, max(lit.g, lit.b));
  let mapped = lit / (1.0 + Y);
  let final_col = mapped * (1.0 + Y * 0.5);
  return vec4<f32>(final_col, col.a);
}`;

export const make_shaders = (max_lights: number): ShaderSet => ({
	vertex_glsl,
	fragment_glsl: make_fragment_glsl(max_lights),
	wgsl: make_wgsl(max_lights),
});
