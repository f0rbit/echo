# Lighting v2 — multi-light system for echo subsystems

> Status: approved, ready for implementation.
> Design locked: uniform-array additive sum + Reinhard tonemap, single `Filter` on world Container.
> Both consumers will be migrated; breaking changes are explicitly allowed.

---

## §1 Goals + non-goals

### Goals

1. Replace the single-source `make_light_filter` in `bestiary` and `dungeon-walk` with a multi-light system that supports up to 16 simultaneous lights (configurable to 8).
2. Cone/spotlight support (omni by default).
3. Per-light flicker profiles (torch, candle, fluorescent, sine) with **deterministic** evaluation given seed + simulation tick.
4. Handle-based API (`add`/`remove`/`set_*`) — no ECS components in this iteration.
5. Cookbook of palette presets (`moon_cavern`, `warm_torch`, `frostbite`, `lab`, `sunset`, `hellscape`) — a scene preset is `{ ambient, default_torch_color, default_torch_radius }`, not just an ambient color.
6. Live demo in bestiary: player torch + ≥1 brazier + summoner glow, three concurrent lights with distinct flicker.
7. dungeon-walk preserves its existing warm-torch single-light visual.
8. Existing replay-as-test fixtures stay green. Add ≥1 deterministic flicker test.

### Non-goals (explicit)

- **No ECS `light_c` component**, no entity-attached lights as systems-of-record. (Revisit at forge promotion v0.4.0 if usage justifies it.)
- **No hard shadows.** That's where Slembcke's offscreen-lightmap pattern earns its complexity; we don't need it yet. Re-evaluate when the first shadow-casting wall lands.
- **No HDR / bloom / colour grading.** Reinhard tonemap is the entire post chain.
- **No promoting to `@f0rbit/forge` yet** — see §5. Stays game-side as duplicated code.
- **No `subsystems/_shared/`** — forbidden by `AGENTS.md` line 31–33.
- **Telegraph red-pulse light** (proposed v3 enemy hint) — flagged but not in scope.

---

## §2 Final API

Path: `subsystems/<name>/src/systems/light/` (folder, not single file — module has enough surface to justify it).

### Module layout

```
subsystems/<name>/src/systems/light/
├── index.ts          # public re-exports
├── shaders.ts        # GLSL + WGSL string constants
├── flicker.ts        # pure flicker math, deterministic
├── presets.ts        # palette cookbook (moon_cavern, warm_torch, …)
└── system.ts         # make_light_system + follow systems
```

### Public types

```ts
// index.ts re-exports everything below.

import type { System } from "@f0rbit/forge";
import type { Filter } from "pixi.js";

export type LightHandle = { readonly id: number };

export type FlickerProfile =
  | { kind: "torch"; amount?: number; seed?: number }
  | { kind: "candle"; amount?: number; seed?: number }
  | { kind: "fluorescent"; seed?: number }
  | { kind: "sine"; hz: number; amount: number };

export type LightCone = {
  dir: readonly [number, number];  // expected normalised; system re-normalises defensively
  inner_deg: number;               // full intensity inside this half-angle
  outer_deg: number;               // zero intensity outside this half-angle; soft falloff between
};

export type LightSpec = {
  pos_px: readonly [number, number];
  color: readonly [number, number, number];  // RGB 0..1
  radius_px: number;
  intensity: number;                          // base 0..1 (can go >1 if you want bloom-ish punch)
  falloff?: number;                           // default 1.4
  cone?: LightCone;                           // omitted = omnidirectional
  flicker?: FlickerProfile;
};

export type LightSystemConfig = {
  design: { width: number; height: number };
  ambient?: readonly [number, number, number];   // default [0.04, 0.04, 0.08]
  max_lights?: 8 | 16;                            // shader-baked constant; default 16
};

export type LightSystem = {
  filter: Filter;
  add: (spec: LightSpec) => LightHandle;
  remove: (handle: LightHandle) => void;
  set_pos: (handle: LightHandle, x: number, y: number) => void;
  set_intensity: (handle: LightHandle, value: number) => void;
  set_color: (handle: LightHandle, rgb: readonly [number, number, number]) => void;
  set_ambient: (rgb: readonly [number, number, number]) => void;
  update_uniforms: () => void;
};

export const make_light_system: (config: LightSystemConfig) => LightSystem;
```

### Follow-system helpers

```ts
// system.ts also exports:

// Player-only convenience (matches existing API surface).
export const player_light_follow_system: (
  ls: LightSystem,
  handle: LightHandle,
) => System;

// Generic: copy any entity's visual_pos_c into the given light handle each render frame.
// `pos_component` is passed in because each subsystem owns its own visual_pos_c.
export const make_light_follow_system: <P extends { x: number; y: number }>(
  ls: LightSystem,
  handle: LightHandle,
  entity_id: import("@f0rbit/forge").Id,
  pos_component: import("@f0rbit/forge").Component<P>,
) => System;

// Driver: evaluates flicker for every light, writes uniforms. Must be added to the
// "render" schedule stage.
export const light_uniforms_system: (ls: LightSystem) => System;
```

### Presets

```ts
// presets.ts

export type ScenePreset = {
  ambient: readonly [number, number, number];
  default_torch_color: readonly [number, number, number];
  default_torch_radius: number;
};

export const presets: {
  moon_cavern: ScenePreset;  // cool blue ambient (matches current bestiary visual)
  warm_torch:  ScenePreset;  // warm torch ambient (matches current dungeon-walk visual)
  frostbite:   ScenePreset;
  lab:         ScenePreset;  // cold neutral + greenish torches (fluorescent friendly)
  sunset:      ScenePreset;
  hellscape:   ScenePreset;
};
```

Concrete values (coders may tune by eye to match current visuals on first wire-up):

```ts
moon_cavern: { ambient: [0.04, 0.04, 0.08], default_torch_color: [0.78, 0.85, 1.00], default_torch_radius: 96 },
warm_torch:  { ambient: [0.08, 0.04, 0.02], default_torch_color: [1.00, 0.78, 0.42], default_torch_radius: 88 },
frostbite:   { ambient: [0.05, 0.07, 0.10], default_torch_color: [0.70, 0.92, 1.00], default_torch_radius: 96 },
lab:         { ambient: [0.10, 0.12, 0.12], default_torch_color: [0.65, 1.00, 0.85], default_torch_radius: 110 },
sunset:      { ambient: [0.12, 0.06, 0.05], default_torch_color: [1.00, 0.55, 0.30], default_torch_radius: 96 },
hellscape:   { ambient: [0.08, 0.02, 0.02], default_torch_color: [1.00, 0.35, 0.15], default_torch_radius: 80 },
```

### Behavioural contract (resolved unilateral decisions)

- **Slot exhaustion:** `add()` past `max_lights` returns a sentinel handle (`{ id: -1 }`); `set_*` on it is a no-op, `remove()` is safe. Emit `console.warn` **once per session** (module-scoped guard).
- **Cone validation:** if `inner_deg > outer_deg`, swap them silently; clamp both to `[0, 180]`. Game-dev ergonomics over correctness theatre.
- **Removed slot compaction:** dense array. `remove(h)` swaps the last live light into slot `h.id`, decrements `count`. The relocated light's handle id is **rewritten in place** — handles are owned by the system, callers store handles by reference. (Document: handles are stable in identity but their backing slot may move. Callers should not assume `h.id` is durable beyond `set_*` calls.)
  - Alternative (rejected): generational handles. Overkill for ≤16 slots; doubles handle size.
- **`set_color` / `set_intensity` overwrite the spec.** Flicker, evaluated each frame in `update_uniforms()`, **multiplies on top** of the current "set" intensity. So `set_intensity(h, 0.5)` then a `torch` flicker with `amount=0.2` produces `0.5 * (0.85..1.10)` modulated each frame.
- **`update_uniforms()` should be called from the `render` stage**, not `post`. It's a visual concern; same stage as `win_overlay_system`. Documented in module JSDoc.
- **`set_ambient` mutates immediately**, no flicker on ambient.

---

## §3 Shader contract

### Uniforms (target shape — verify in Pixi v8 layout before final coder cut)

| Uniform | Type | Notes |
|---|---|---|
| `uAmbient` | `vec3<f32>` | scene ambient term |
| `uCount` | `i32` | active light count, ≤ `max_lights` |
| `uLights[N]` | `array<vec4<f32>, N>` | per-light: `xy = pos_px, z = radius_px, w = intensity` |
| `uLightColors[N]` | `array<vec4<f32>, N>` | per-light: `rgb = tint, a = falloff exponent` |
| `uLightCones[N]` | `array<vec4<f32>, N>` | per-light: `xy = dir, z = cos(inner), w = cos(outer); z < -1.0 → omni` |

`N` is shader-baked from `config.max_lights` (default 16; alt 8). Generate two shader strings — pick at build time from config. **Do not** load both into the same `Filter`.

### GLSL ES 3.0 (fragment) — target shape

```glsl
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec3 uAmbient;
uniform highp int uCount;
uniform highp vec4 uLights[16];
uniform highp vec4 uLightColors[16];
uniform highp vec4 uLightCones[16];
out vec4 finalColor;

void main() {
  vec4 col = texture(uTexture, vTextureCoord);
  vec2 px = vTextureCoord * uInputSize.xy;
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 16; i++) {
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
  vec3 lit_target  = col.rgb * (uAmbient + sum);
  vec3 ambient_only = uAmbient * col.rgb;
  vec3 lit = max(ambient_only, lit_target);
  float Y = max(lit.r, max(lit.g, lit.b));
  vec3 final = lit / (1.0 + Y);
  finalColor = vec4(final * (1.0 + Y * 0.5), col.a);
}
```

### WGSL — alignment + parity rules

Pixi v8 places user uniforms in **one** `UniformGroup` bound at `@group(1) @binding(0)`. Three flat `array<vec4<f32>, N>` fields (not an `array<LightStruct, N>`) — WGSL array-of-struct stride is 16-byte-aligned with padding rules that are easy to get wrong; flat vec4 arrays are tightly packed and match GLSL.

```wgsl
struct LightUniforms {
  uAmbient: vec3<f32>,
  _pad0: f32,                          // explicit pad to vec4 boundary
  uCount: i32,
  _pad1: vec3<i32>,                    // pad i32 to vec4 boundary
  uLights:      array<vec4<f32>, 16>,
  uLightColors: array<vec4<f32>, 16>,
  uLightCones:  array<vec4<f32>, 16>,
};

@group(1) @binding(0) var<uniform> light: LightUniforms;
```

WGSL fragment mirrors the GLSL shape using `light.uLights[i]` etc.

### Pixi v8 gotchas (call these out in the coder task — do not skip)

1. **`highp` everywhere.** Every uniform shared between vertex and fragment must be explicitly `highp` in the fragment shader, or program link **fails silently** (the existing `light.ts` already follows this).
2. **GLSL ES 3.0 `for` loop with `break`.** WebGL2 supports constant-bound loops; the `if (i >= uCount) break;` pattern is the canonical way to early-out. **Do not** put `uCount` as the loop bound directly (some drivers reject it).
3. **WGSL array padding.** Use three flat `array<vec4<f32>, N>` fields (see above). Sanity-check stride by inspecting the byte size — expected for `max_lights=16`: `12 + 4 (ambient+pad) + 4 + 12 (count+pad) + 3 * 16 * 16 = 800` bytes.
4. **`UniformGroup` size matters.** When changing `max_lights` from 16 → 8, the WGSL struct must shrink to match — re-emit both shaders, re-emit the `UniformGroup` schema. The factory builds whichever variant config requests.
5. **`finalColor` punch term.** The plan's tonemap final-line `final * (1.0 + Y * 0.5)` is the spirit-preserving variant. **Coders: sanity check by stepping `Y` from 0..3 in a notebook script** — at `Y=0` it should match `final` exactly; at `Y=1` it should boost ~1.5x. If the math reads wrong, fall back to vanilla Reinhard `final = lit / (1.0 + lit_max)` and document the regression.
6. **Filter on world Container** stays unchanged from current consumers — both call sites already do `app.render.world.filters = [filter]` and apply a `filterArea`. Reuse that pattern verbatim.

---

## §4 Flicker math reference

### Determinism stance

**Flicker is driven by `ctx.time.tick + ctx.time.alpha`** — tick is the sim's integer step (deterministic, replay-stable); `alpha` ∈ [0, 1] is the interpolation factor toward the next tick (smooths visuals between fixed sim steps, same shape as `visual_pos_c` lerp). Replay determinism is preserved because: sim state never reads flicker output, and `alpha` is a render-only quantity. Two replay runs produce identical world hashes; the *visual* may differ frame-to-frame at unlocked render rates, which is correct.

Internally each light computes its time scalar as:

```ts
const t = (ctx.time.tick + ctx.time.alpha) * ctx.time.fixed_dt;  // seconds
```

This is **monotonic**, **resolution-independent across render framerates**, and **identical between replay runs** (same tick sequence).

### Per-profile formulas

`amount` is the peak deviation from 1.0. Default `amount = 0.15` for torch/candle. Output is a **multiplier** applied to the light's `intensity` (and, for `torch`, a coupled multiplier on `radius_px`).

#### `torch` — 3-octave value noise

```ts
// flicker.ts
const hash01 = (n: number): number => {
  // deterministic [0,1) hash; mulberry32-style
  let x = (n | 0) ^ 0x9e3779b1;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000;
};

const value_noise_1d = (seed: number, t: number): number => {
  const i = Math.floor(t);
  const f = t - i;
  const a = hash01(seed ^ i);
  const b = hash01(seed ^ (i + 1));
  const u = f * f * (3 - 2 * f);  // smoothstep
  return a * (1 - u) + b * u;     // [0,1)
};

const fbm3 = (seed: number, t: number): number => {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < 3; o++) {
    sum += value_noise_1d(seed + o * 1013, t * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;  // [0,1)
};

export const torch_flicker = (
  seed: number,
  t: number,
  amount: number,
): { intensity: number; radius: number } => {
  // intensity in [1-amount, 1+amount*0.67] biased high; radius lightly correlated.
  const n = fbm3(seed, t * 7.0);   // ~7 Hz dominant
  const i_mul = 1 + (n - 0.4) * amount * 2;     // ~[0.85, 1.10] when amount=0.15
  const r_mul = 1 + (n - 0.5) * amount * 0.6;   // ~[0.955, 1.045] coupled
  return { intensity: i_mul, radius: r_mul };
};
```

#### `candle` — slower, occasional dips

Same noise shape, slower (~3 Hz) plus a low-prob "dip" gate.

```ts
export const candle_flicker = (
  seed: number,
  t: number,
  amount: number,
): { intensity: number; radius: number } => {
  const n = fbm3(seed, t * 3.0);
  const i_base = 1 + (n - 0.5) * amount * 1.4;
  const dip_gate = hash01(seed ^ Math.floor(t * 5));
  const dip = dip_gate < 0.05 ? 0.7 : 1.0;  // 5% chance of 30% dip per ~0.2s window
  const i_mul = i_base * dip;
  const r_mul = 1 + (n - 0.5) * amount * 0.4;
  return { intensity: i_mul, radius: r_mul };
};
```

#### `fluorescent` — Valve lightstyle string @ 10 Hz

Valve's idTech-derived lightstyle: a string of characters `a`..`z` where `a = 0%`, `z = 200%`, looped at 10 Hz. Canonical "fluorescent flicker" is `"mmamammmmammamamaaamammma"`.

```ts
const fluorescent_pattern = "mmamammmmammamamaaamammma";
export const fluorescent_flicker = (seed: number, t: number): number => {
  const step = Math.floor(t * 10);  // 10 Hz
  const jitter = Math.floor(hash01(seed) * fluorescent_pattern.length);
  const ch = fluorescent_pattern[(step + jitter) % fluorescent_pattern.length]!;
  return (ch.charCodeAt(0) - "a".charCodeAt(0)) / 12.5;  // 'a'=0, 'm'≈1.0, 'z'=2.0
};
```

#### `sine` — simple oscillation

```ts
export const sine_flicker = (hz: number, amount: number, t: number): number =>
  1 + Math.sin(t * 2 * Math.PI * hz) * amount;
```

### Seed scheme

- If `spec.flicker.seed` is provided, use it verbatim.
- Otherwise, derive from the light's slot id at `add()` time: `seed = handle.id * 2654435761 | 0`. This guarantees uniqueness when two lights share the same `kind` without explicit seeds.
- **Document:** if the caller wants reproducibility across `add()` order changes, they MUST pass an explicit `seed`.

### Tests (deterministic flicker)

```ts
// subsystems/<name>/test/light-flicker.test.ts
import { describe, expect, test } from "bun:test";
import { torch_flicker, candle_flicker, fluorescent_flicker, sine_flicker } from "../src/systems/light/flicker.ts";

describe("flicker is deterministic", () => {
  test("torch_flicker is pure given (seed, t, amount)", () => {
    const a = torch_flicker(42, 1.234, 0.15);
    const b = torch_flicker(42, 1.234, 0.15);
    expect(a.intensity).toBe(b.intensity);
    expect(a.radius).toBe(b.radius);
  });
  test("torch_flicker intensity stays in [1-amount, 1+amount] roughly", () => {
    for (let i = 0; i < 200; i++) {
      const { intensity } = torch_flicker(7, i * 0.01, 0.15);
      expect(intensity).toBeGreaterThan(0.7);
      expect(intensity).toBeLessThan(1.3);
    }
  });
  test("fluorescent_flicker steps at 10 Hz", () => {
    const a = fluorescent_flicker(0, 0.05);
    const b = fluorescent_flicker(0, 0.099);
    const c = fluorescent_flicker(0, 0.101);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  test("sine_flicker matches closed form", () => {
    const v = sine_flicker(2, 0.1, 0.125);
    expect(v).toBeCloseTo(1 + Math.sin(0.125 * 2 * Math.PI * 2) * 0.1, 10);
  });
});
```

---

## §5 Forge promotion decision

**Decision: stay game-side for this iteration. Forge promotion candidate for v0.4.0.**

### Why not promote now

1. The API has zero real-world use. Promoting to forge before two consumers exercise it in different scenes risks baking in the wrong abstraction. Right now both consumers are near-clones of each other; the divergence that justifies a shared abstraction hasn't happened.
2. forge v0.3.x is stable; v0.4.0 is already budgeted for `forge.script` + possible FSM helper (see `PLAN.md` line 425, 504). Adding lighting to that bump would inflate scope.
3. The ~400 LOC duplication cost across two subsystems is the **doctrinal price** documented in `AGENTS.md` line 31–33: "Duplication is the signal that something belongs in forge — not in a sidecar package."
4. We expect the API to wear rough edges that surface in real use: cone math sign conventions, handle compaction semantics under heavy churn, GPU uniform write strategy (we currently rewrite all `N * 12` floats every frame — possibly wasteful, possibly fine). Discover those frictions *before* freezing the forge API.

### Why not commit to game-side forever

When the third consumer arrives (likely `arena` subsystem in Phase 3 per `PLAN.md` §7), the duplication will be felt. That's the natural promotion gate. Per `PLAN.md` line 190: "helper used in 2+ subsystems → propose forge promotion."

We're already at 2 with this iteration. **The promotion criterion is met by count but not by API maturity** — explicit override.

### Forge promotion checklist for v0.4.0 (record only)

- Move `flicker.ts` verbatim to `forge.light/flicker` — pure math, zero forge dependency.
- Move shader strings to `forge.light/shaders` — Pixi v8 is already a forge peer (`@f0rbit/forge/pixi`).
- Decide: is `make_light_system` a forge primitive, or does forge ship just the shader + flicker math and games own the handle table? **Lean: ship the full system.** The handle table is identical across every game that needs lighting.
- Re-evaluate uniform write strategy. With shadows pending, we may want a dirty-flag approach.
- Generational handles become worth considering if forge users churn lights more aggressively than echo's two subsystems do.

---

## §6 Phase 1 — Core module + bestiary integration

**Owner:** one `coder` (default model). Sequential; no parallel coders. Reason: the module is small (~400 LOC across 5 files) but cohesive — splitting shader/TS/integration across parallel coders has high integration-error risk and zero throughput win. Single commit at phase end via verification coder.

**Estimated total LOC:** ~520 (module + bestiary edits + tests).

### Files to create

| File | LOC | Purpose |
|---|---:|---|
| `subsystems/bestiary/src/systems/light/index.ts` | 15 | re-exports |
| `subsystems/bestiary/src/systems/light/shaders.ts` | 200 | GLSL + WGSL string builders parameterised by `max_lights`; both 8 and 16 variants generated lazily |
| `subsystems/bestiary/src/systems/light/flicker.ts` | 80 | pure functions per §4 |
| `subsystems/bestiary/src/systems/light/presets.ts` | 40 | preset cookbook per §2 |
| `subsystems/bestiary/src/systems/light/system.ts` | 180 | `make_light_system`, follow systems, `light_uniforms_system` |
| `subsystems/bestiary/test/light-flicker.test.ts` | 50 | per §4 |

### Files to edit

| File | Edit |
|---|---|
| `subsystems/bestiary/src/main.ts` | Replace `make_light_filter` import + call with `make_light_system`. Add three concurrent lights (see below). Pass `light_system` into `game_plugin` instead of bare `LightFilter`. |
| `subsystems/bestiary/src/plugin.ts` | Replace `LightFilter` type import + `light_follow_system` registration with new system. Add `light_uniforms_system` to `"render"` stage. Wire the three demo lights to entities (player follow, summoner follow, brazier static). |
| `subsystems/bestiary/src/arena-gen.ts` | Add one constant `brazier_cells: readonly Cell[]` (start with one, position `{ x: 8, y: 6 }` — clear of player spawn 15,10 and patroller 10,10, on a floor tile). Reserve those cells in `place_pillars`. **No new entities, no new components** — braziers are visual-only, not ECS. Export `brazier_cells` so `main.ts`/`plugin.ts` can read positions. |

### Files to delete

| File | Action |
|---|---|
| `subsystems/bestiary/src/systems/light.ts` | **DELETE** after new system is wired. Breaking change is fine — `AGENTS.md` line 31–33 + user's "we own both consumers". |

### Demo lights to wire in bestiary

In `main.ts`, after `make_light_system`:

```ts
const ls = make_light_system({
  design,
  ambient: presets.moon_cavern.ambient,
  max_lights: 16,
});

// Light 1 — player torch, follows player visual_pos.
const player_torch = ls.add({
  pos_px: [design.width / 2, design.height / 2],
  color: presets.moon_cavern.default_torch_color,  // moonlight-blue
  radius_px: presets.moon_cavern.default_torch_radius,
  intensity: 0.95,
  flicker: { kind: "torch", amount: 0.12, seed: 1 },
});

// Light 2 — static brazier at brazier_cells[0]. Warm orange against the cool ambient.
const brazier_world = g.cell_to_world(brazier_cells[0]!.x, brazier_cells[0]!.y);
ls.add({
  pos_px: [brazier_world.x + g.tile / 2, brazier_world.y + g.tile / 2],
  color: [1.0, 0.55, 0.25],
  radius_px: 64,
  intensity: 0.85,
  falloff: 1.6,
  flicker: { kind: "torch", amount: 0.18, seed: 2 },
});

// Light 3 — summoner glow (purple-green tint reads as "magic").
// Wired in plugin.ts via make_light_follow_system once the summoner is spawned.
const summoner_glow = ls.add({
  pos_px: [0, 0],  // overwritten by follow system on first tick
  color: [0.6, 0.3, 0.9],
  radius_px: 56,
  intensity: 0.75,
  flicker: { kind: "candle", amount: 0.15, seed: 3 },
});
```

In `plugin.ts`, pass `ls`, `player_torch`, `summoner_glow` via `GamePluginOpts`. Inside the plugin:

```ts
sch.add("post", player_light_follow_system(opts.ls, opts.player_torch), "bst.light_follow_player");
// Summoner: find the summoner entity id once (it's spawned in arena_gen, so it exists by "post" stage).
// Use a deferred lookup system that resolves the id on first tick, then memoises:
sch.add("post", make_summoner_light_follow_system(opts.ls, opts.summoner_glow), "bst.light_follow_summoner");
// Uniforms — render stage.
sch.add("render", light_uniforms_system(opts.ls), "bst.light_uniforms");
```

`make_summoner_light_follow_system` is a tiny closure that, on each call, queries `[visual_pos_c, summoner_c]` and copies pos. If the summoner is despawned it just skips. No new id-stable lookup helper required.

**Optional v3 telegraph pulse — out of scope.** Mark in code with `// TODO(v3): pulse light at telegraph start`.

### Verification (Phase 1)

- `cd subsystems/bestiary && bun test` — all existing tests pass; the new `light-flicker.test.ts` is green.
- `cd subsystems/bestiary && bun run typecheck` — clean.
- `cd subsystems/bestiary && bun run build` — clean.
- Run dev (`bun run dev`), open in browser, confirm visually: three distinct light sources, player torch follows on move, brazier is stationary and warm, summoner glow follows the summoner entity and reads purple. The cool moon ambient ([0.04, 0.04, 0.08]) is the existing visual — match.
- Replay test `arena.replay.json` produces the identical hash `20c9832ca030720900393ef4d8e12473bb120e1b743f7ea4d05896be2263fbf8`. **Flicker MUST NOT affect sim hash.** If the hash changes, lighting has leaked into sim state — bug.

### Phase 1 commit

`feat(bestiary): multi-light system with flicker + cones`

---

## §7 Phase 2 — dungeon-walk migration

**Owner:** one `coder-fast` (Haiku 4.5). Mostly mechanical: copy the module, swap one preset, delete old file. No design decisions. Depends on Phase 1 (need the API shape finalised in bestiary first).

**Estimated total LOC:** ~530 (mostly copy-paste duplication).

### Files to create

Verbatim copies from `subsystems/bestiary/src/systems/light/*`:

| File | Action |
|---|---|
| `subsystems/dungeon-walk/src/systems/light/index.ts` | Copy from bestiary |
| `subsystems/dungeon-walk/src/systems/light/shaders.ts` | Copy from bestiary |
| `subsystems/dungeon-walk/src/systems/light/flicker.ts` | Copy from bestiary |
| `subsystems/dungeon-walk/src/systems/light/presets.ts` | Copy from bestiary |
| `subsystems/dungeon-walk/src/systems/light/system.ts` | Copy from bestiary |
| `subsystems/dungeon-walk/test/light-flicker.test.ts` | Copy from bestiary |

**No diffs allowed between the two copies in Phase 2.** This is doctrinal duplication. The verification coder must `diff -r` the two `light/` folders and report any drift. Any divergence triggers an immediate fix before commit.

### Files to edit

| File | Edit |
|---|---|
| `subsystems/dungeon-walk/src/main.ts` | Replace `make_light_filter(design, { ambient: [0.08, 0.04, 0.02], falloff: 1.6 })` with `make_light_system({ design, ambient: presets.warm_torch.ambient })` + a single player torch using `presets.warm_torch.default_torch_color`, `presets.warm_torch.default_torch_radius`, `falloff: 1.6`, `flicker: { kind: "torch", amount: 0.12 }`. |
| `subsystems/dungeon-walk/src/plugin.ts` | Replace `LightFilter` import + `light_follow_system` registration with new equivalents. Add `light_uniforms_system` to `"render"` stage. |

### Files to delete

| File | Action |
|---|---|
| `subsystems/dungeon-walk/src/systems/light.ts` | **DELETE.** |

### Verification (Phase 2)

- `diff -r subsystems/bestiary/src/systems/light subsystems/dungeon-walk/src/systems/light` — must be empty.
- `cd subsystems/dungeon-walk && bun test` — `traverse.replay.json` hash unchanged.
- `bun run typecheck` + `bun run build` clean.
- Visual check: warm-torch ambient matches the pre-migration look. Single player torch, no other lights. Flicker on is acceptable visual change — if user dislikes, drop `flicker` from the spec; doesn't affect determinism.
- Root `bun test` from `~/dev/echo` green (runs both subsystems' replay tests).

### Phase 2 commit

`feat(dungeon-walk): migrate to multi-light system`

---

## §8 Verification (cross-phase)

### What runs

```
cd ~/dev/echo
bun test                                    # both subsystem replay-as-test fixtures + new flicker tests
cd subsystems/bestiary && bun run typecheck && bun run build
cd subsystems/dungeon-walk && bun run typecheck && bun run build
```

### Replay determinism

- **`subsystems/bestiary/test/replay.test.ts`** — world hash at tick 600 must remain `20c9832ca030720900393ef4d8e12473bb120e1b743f7ea4d05896be2263fbf8`. The "two consecutive runs produce byte-identical hashes" test must stay green. If either fails, flicker is leaking into sim state — revert and investigate.
- **`subsystems/dungeon-walk/test/replay.test.ts`** — equivalent contract.

### Visual regression — manual

Subsystems must produce the same "feel" as before with the new system layered on:

**bestiary post-Phase 1:**
- Cool moonlit ambient (`moon_cavern`) — matches pre-migration.
- Player walking through arena: torch follows, flicker is subtle (~12% peak), pixel-aliased.
- Brazier at cell (8, 6) visible as a warm orange pool against the cool ambient — gives a clear "I can see lighting works" signal.
- Summoner glow at cell (15, 4) reads purple even before the summoner spawns minions — gives "summoner is a magical source" identity.
- All three lights flicker independently (different seeds).
- Telegraph and debug overlay still render correctly (the filter is below them in z-order — already true via `zIndex`, verify).

**dungeon-walk post-Phase 2:**
- Warm-torch ambient matches the pre-migration look exactly.
- Single player torch, no other lights.
- Slight flicker (new) — acceptable visual change.

### Post-deploy

After GH Pages deploy from `main`:
- https://f0rbit.github.io/echo/bestiary/ — walk player around, confirm three lights.
- https://f0rbit.github.io/echo/dungeon-walk/ — confirm warm torch unchanged.

### Failure modes to watch for

- **Black screen / no shader compile:** missing `highp` qualifier. Check fragment uniforms.
- **WGSL backend rejects struct:** alignment mismatch. Re-emit with explicit `_pad` fields.
- **Replay hash differs:** flicker leaked into sim. Verify `update_uniforms()` is in `"render"` stage and never writes to `world` or `ctx.res`.
- **Lights "drag" behind moving entities:** follow system in wrong stage. Should be `"post"` (after movement integrates), same as the current `light_follow_system`.

---

## §9 Open questions for the orchestrator

These are decisions I (the planner) couldn't justify resolving unilaterally. Coder agents should proceed with the listed defaults unless the orchestrator overrides.

1. **Brazier count + cell placement in bestiary.** Plan defaults to a single brazier at cell `(8, 6)`. The user's prompt said "static brazier(s) — placed in the arena at a hand-picked floor tile, `flicker: torch` with different seed", suggesting plural may be desired. **Default: one brazier.** Override: orchestrator can request 2–3 with positions. Adding more is trivial — extend `brazier_cells` array in `arena-gen.ts`. *(Recommend: ship with one in Phase 1, eyeball the result, add more in a follow-up if too sparse.)*
2. **Summoner glow as flicker `candle` vs. `sine`.** Plan defaults to `candle` because the prompt explicitly suggested it for "subtle pulse." But `sine 0.6 Hz amount 0.1` would read more "magical / breathing" than "wax flame." **Default: `candle`.** Override: switch in `main.ts` is one line.
3. **`max_lights` baked in default = 16.** No active consumer needs >5. Smaller would save uniform bandwidth but doubles shader emission complexity (8 + 16 variants). **Default: only emit 16.** If profiling later shows the cost matters, emit 8 too — the factory is parameterised.
4. **Telegraph red-pulse light for ranged enemy pre-fire.** Prompt flagged as "skip if it makes the plan blow out." **Default: skip in Phase 1.** TODO comment left in the relevant system. Estimated +30 LOC if added; could ride as a Phase 1b (after main two phases land) without blocking either consumer.
5. **Re-record bestiary's `arena.replay.json` if the hash changes for a non-sim reason.** Plan asserts the hash must stay identical. If it shifts because, e.g., a render-stage system ordering quirk surfaces, we have two options: (a) treat it as a bug and fix; (b) re-record with `tools/record-arena.ts` and update the expected hash. **Default: option (a) — investigate and fix.** Only fall back to (b) if the orchestrator explicitly approves after seeing the failure.
6. **Should `set_pos` accept pixel coords or world coords?** Currently the existing API uses raw pixels (matches the shader). World coords would require a grid reference inside the light system, which it doesn't have. **Default: pixels.** Documented in JSDoc.

---

## Suggested AGENTS.md updates

Append to `~/dev/echo/AGENTS.md` after this work lands (only with user approval):

```md
## Lighting

Both `bestiary` and `dungeon-walk` ship an identical copy of `src/systems/light/`. This is intentional doctrinal duplication (see PLAN.md §5). When a third consumer needs lighting, propose forge promotion for v0.4.0 — do not introduce a `subsystems/_shared/light/`.

The light system is driven from the `"render"` schedule stage, not `"post"`. Flicker is deterministic on `(ctx.time.tick + ctx.time.alpha) * ctx.time.fixed_dt` but never affects sim state — replay hashes must remain stable when lighting changes.
```

---

## Task index (for devpad mirroring, in execution order)

| # | Task | Phase | Parallel? | Files | LOC |
|---:|---|---|---|---|---:|
| 1 | Build `light/` module in bestiary (shaders, flicker, presets, system, index) | 1 | no | `subsystems/bestiary/src/systems/light/*` | ~515 |
| 2 | Add `light-flicker.test.ts` to bestiary | 1 | no (same coder) | `subsystems/bestiary/test/light-flicker.test.ts` | ~50 |
| 3 | Wire three demo lights into bestiary `main.ts` + `plugin.ts`; add `brazier_cells` to `arena-gen.ts` | 1 | no (same coder) | `subsystems/bestiary/src/{main,plugin}.ts`, `subsystems/bestiary/src/arena-gen.ts` | ~60 |
| 4 | Delete `subsystems/bestiary/src/systems/light.ts` | 1 | no (same coder) | — | -162 |
| 5 | **Phase 1 verification** — typecheck + test (replay hash) + build + visual smoke + commit | 1 verify | sequential | — | — |
| 6 | Copy `light/` folder verbatim from bestiary into dungeon-walk | 2 | no | `subsystems/dungeon-walk/src/systems/light/*` | ~515 |
| 7 | Copy `light-flicker.test.ts` verbatim into dungeon-walk test/ | 2 | no (same coder) | `subsystems/dungeon-walk/test/light-flicker.test.ts` | ~50 |
| 8 | Rewire dungeon-walk `main.ts` + `plugin.ts` to use new system with `warm_torch` preset | 2 | no (same coder) | `subsystems/dungeon-walk/src/{main,plugin}.ts` | ~30 |
| 9 | Delete `subsystems/dungeon-walk/src/systems/light.ts` | 2 | no (same coder) | — | -162 |
| 10 | **Phase 2 verification** — diff -r vs bestiary, typecheck + test + build + visual smoke + commit | 2 verify | sequential | — | — |
