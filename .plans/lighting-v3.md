# Lighting v3 — grid-LOS unified visibility + illumination

> Status: architecture approved by user; this plan locks API, shader contract, and phase breakdown.
> Replaces `lighting-v2.md` (already shipped — commits `719d1ce`, `b9c65b1`).
> Two-phase rewrite, single coder per phase, atomic commit per phase.

---

## §1 Goals + non-goals + what we delete

### Goals

1. **One concept** for visibility + illumination. The player is an "eye light"; what the eye light reaches is what the player can see. Other lights add colour to the cells they reach. No second visibility system pulling against the first.
2. **CPU-side grid LOS**, GPU-side sampling. Lights compute their `cells_reached` via `g.line_of_sight` once per tick (or once ever, for static lights). The fragment shader samples a tiny per-cell texture and does almost no math — no uniform arrays, no per-pixel distance loops, no cone branches.
3. **Bilinear texture filtering** between cells gives "soft wall edges" automatically, without any shader work.
4. **Replay determinism preserved.** Lighting is render-only. Bestiary replay hash `20c9832ca030720900393ef4d8e12473bb120e1b743f7ea4d05896be2263fbf8` must remain unchanged; dungeon-walk replay tests must stay green.
5. **Doctrinal duplication** between bestiary and dungeon-walk (no `subsystems/_shared/`). Phase B is a verbatim copy from Phase A.

### Non-goals (explicit)

- **No forge promotion this iteration.** Same stance as v2 §5 — re-evaluate at v0.4.0 with a third consumer.
- **No `_shared/` package.** Forbidden by repo `AGENTS.md`.
- **No cones.** Removed from v2; restorable later as a CPU-side mask filter (multiply each light's `cells_reached` membership through a dot-product test before falloff). Not needed for current demo.
- **No HDR / bloom.** Optional Reinhard tonemap survives as a one-line fallback if per-cell sums exceed ~1.5.
- **No offscreen lightmap blit pipeline** (Slembcke's pattern). The per-cell texture *is* a lightmap, but at world-grid resolution, uploaded as one `BufferImageSource` rather than rendered into via Pixi RenderTexture. Hard shadows stay out of scope; LOS already gives "blocked == not lit".
- **No `light_c` component / ECS-of-record.** Handle-based imperative API like v2.

### What v2 we delete

| Path | LOC | Reason |
|---|---:|---|
| `subsystems/bestiary/src/systems/fov.ts` | 60 | Eye light is the new FOV. |
| `subsystems/bestiary/src/systems/light/system.ts` (rewritten in place) | ~262 | Different internals (grid + texture). Public API near-identical, deltas in §2. |
| `subsystems/bestiary/src/systems/light/shaders.ts` (rewritten in place) | ~152 | Single texture sampler, no uniform arrays, no cones. |
| `subsystems/dungeon-walk/src/systems/fov.ts` | 45 | Same reason. |
| `subsystems/dungeon-walk/src/systems/light.ts` (already v1; never got v2) | 162 | Replaced by `light/` folder copied from bestiary. |
| `fov_system` registration in both `plugin.ts` files | — | Visibility = eye-light A channel. |

What persists from v2 unchanged:

- `flicker.ts` (pure math, deterministic). Same four profiles, same hash, same seeds, same `(tick + alpha) * fixed_dt` clock.
- `presets.ts` (six palette presets). `default_torch_radius` is reinterpreted as cell radius (see §9 Q3).
- `index.ts` re-exports.
- Module path `subsystems/<sub>/src/systems/light/` (folder).
- Replay-as-test contract.
- Doctrinal duplication across the two subsystems.

---

## §2 Final API

Path: `subsystems/<name>/src/systems/light/`. Five files, same as v2.

```
subsystems/<name>/src/systems/light/
├── index.ts          # public re-exports
├── shaders.ts        # GLSL + WGSL — single sampler, ~25 lines fragment
├── flicker.ts        # UNCHANGED from v2 — pure math
├── presets.ts        # UNCHANGED palette names; default_torch_radius now means cells
└── system.ts         # rewritten: per-cell grid, per-light cells_reached cache
```

### Public types

```ts
import type { Component, Id, System } from "@f0rbit/forge";
import type { Filter } from "pixi.js";

export type LightHandle = { readonly id: number };

export type FlickerProfile =
  | { kind: "torch"; amount?: number; seed?: number }
  | { kind: "candle"; amount?: number; seed?: number }
  | { kind: "fluorescent"; seed?: number }
  | { kind: "sine"; hz: number; amount: number };

export type LightSpec = {
  readonly pos_cell:     readonly [number, number];      // CHANGED: was pos_px
  readonly color:        readonly [number, number, number];
  readonly radius_cells: number;                          // CHANGED: was radius_px
  readonly intensity:    number;                          // 0..1; can exceed 1 for HDR-ish punch
  readonly falloff?:     number;                          // default 1.4 — applied CPU-side per cell
  readonly flicker?:     FlickerProfile;
  // NO `cone` — removed. Restorable as a CPU mask.
};

export type LightSystemConfig = {
  readonly grid:        { readonly cols: number; readonly rows: number; readonly tile: number };
  readonly ambient?:    readonly [number, number, number]; // default [0.04, 0.04, 0.08]
  readonly eye_radius?: number;                            // player vision in cells; default 6
};

export type LightSystem = {
  readonly filter:        Filter;
  readonly eye_handle:    LightHandle;                     // NEW: auto-created eye light
  readonly add:           (spec: LightSpec) => LightHandle;
  readonly remove:        (h: LightHandle) => void;
  readonly set_pos:       (h: LightHandle, cell_x: number, cell_y: number) => void;  // cells
  readonly set_intensity: (h: LightHandle, v: number) => void;
  readonly set_color:     (h: LightHandle, rgb: readonly [number, number, number]) => void;
  readonly set_ambient:   (rgb: readonly [number, number, number]) => void;
  readonly update:        (
    ctx: { time: { tick: number; alpha: number; fixed_dt: number } },
    is_blocking: (cell: { x: number; y: number }) => boolean,
  ) => void;
};

export const make_light_system: (config: LightSystemConfig) => LightSystem;
```

#### API deltas vs v2

| v2 | v3 | Reason |
|---|---|---|
| `pos_px: [number, number]` | `pos_cell: [number, number]` | CPU-side grid is the source of truth; callers must commit to cell space. |
| `radius_px: number` | `radius_cells: number` | Same reason. |
| `cone?: LightCone` | *(removed)* | Per-cell membership replaces cone math. |
| `max_lights?: 8 | 16` | *(removed)* | No uniform array → no slot cap. Soft cap is "fits on the grid". |
| `update_uniforms()` | `update(ctx, is_blocking)` | Needs LOS context per tick. Renamed because it now does work, not just upload. |
| no `eye_handle` | `eye_handle: LightHandle` | The "player light" is now part of the system. |
| `set_pos(h, x_px, y_px)` | `set_pos(h, cell_x, cell_y)` | Cell-space. |
| `LightCone` exported | *(removed)* | Together with `cone`. |
| `config.design` | `config.grid` | The system needs cols/rows/tile, not design pixels. (The Filter still covers the world Container as before; design pixels are derived as `grid.cols * grid.tile`, `grid.rows * grid.tile`.) |

**Breaking changes called out explicitly** — user authorised in prompt. Both consumers will be updated in-place.

### Follow-system helpers

```ts
// system.ts also exports:

// Eye-light follow: copies player visual cell into ls.eye_handle each tick.
// Renamed from v2's `player_light_follow_system`. Behaviour: query player+visual_pos,
// convert to cell coords with `g.world_to_cell`, call ls.set_pos(eye_handle, …).
export const make_eye_follow_system: <P extends { x: number; y: number }>(
  ls: LightSystem,
  grid: import("@f0rbit/forge/grid").Grid,
  pos_component: Component<P>,
  player_marker: Component<true>,
) => System;

// Generic entity-follow: same as v2 but in cell coords.
export const make_light_follow_system: <P extends { x: number; y: number }>(
  ls: LightSystem,
  grid: import("@f0rbit/forge/grid").Grid,
  handle: LightHandle,
  entity_id: Id,
  pos_component: Component<P>,
) => System;

// Marker-follow: same as v2 but cell coords.
export const make_marker_light_follow_system: <M, P extends { x: number; y: number }>(
  ls: LightSystem,
  grid: import("@f0rbit/forge/grid").Grid,
  handle: LightHandle,
  marker: Component<M>,
  pos_component: Component<P>,
) => System;

// Driver: evaluates LOS for moved lights, flicker for all lights, writes grid buffer,
// uploads texture. Wraps a closure over `g` and the `is_blocking` source (a Res or a
// captured Set<number>). MUST be on the `"render"` schedule stage.
export const make_light_update_system: (
  ls: LightSystem,
  grid: import("@f0rbit/forge/grid").Grid,
  resolve_is_blocking: (w: import("@f0rbit/forge").World, ctx: import("@f0rbit/forge").Ctx)
    => ((cell: { x: number; y: number }) => boolean) | null,
) => System;
```

Why a closure for `is_blocking`? Because each subsystem stores its walls differently — bestiary in `arena_r.floors: Set<number>`, dungeon-walk in `dungeon_r.floors: Set<number>`. The closure resolves the resource per tick and returns a predicate; `null` means "skip this tick" (resource not yet populated, e.g. before startup).

### Behavioural contract (resolved unilateral decisions)

- **`eye_handle` is just a regular LightSpec** internally, with `is_eye: true`. Its `cells_reached` drives the alpha channel; its `intensity` and `color` are ignored for RGB accumulation. Created during `make_light_system` with:
  ```ts
  { pos_cell: [0, 0], color: [0, 0, 0], radius_cells: config.eye_radius ?? 6, intensity: 0 }
  ```
  Callers immediately reposition via the eye-follow system.
- **Eye-light never flickers.** Even if the caller calls `set_intensity` on `ls.eye_handle`, it doesn't affect alpha (alpha is binary membership). Documented.
- **`add()` cannot add another eye-light.** The eye-light is owned by the system. There's no public API to create more "visibility lights".
- **`remove(eye_handle)` is a no-op.** Documented.
- **Cell-coord validation.** `set_pos` and `LightSpec.pos_cell` are clipped to `[0, cols-1] × [0, rows-1]` defensively. Out-of-bounds → clamp, no error.
- **LOS cache invalidation.** On `set_pos`, mark that slot's `cells_reached` as dirty. Static lights (never call `set_pos`) compute once on first `update()`. Players/followed lights pay LOS every tick.
- **`set_intensity` overwrite + flicker multiplier.** Same as v2: spec value is the "base", flicker multiplies on top each frame.
- **`set_color` and `set_ambient` mutate immediately**, no flicker on either.
- **No slot exhaustion warning.** No max → no warning. (A million lights is the caller's problem.)
- **No removed-slot compaction at any user-visible level.** Internally `slots: Slot[]` is a dense array; `remove` swaps last into the removed index, updates the moved handle's `.id` in place. Same as v2.

---

## §3 Shader contract

### Uniforms

Single Filter on world Container. The Filter owns:

| Uniform | Type | Notes |
|---|---|---|
| `uAmbient` | `vec3<f32>` | scene ambient term, mutable via `set_ambient` |
| `uGridSize` | `vec2<f32>` | `[cols * tile, rows * tile]` — world pixel size of grid; used to map `vTextureCoord * uInputSize.xy` → grid UV |
| `uLightGrid` | `texture_2d<f32>` + sampler | per-cell RGBA, linear filtering, clamp-to-edge |

That's it. No uniform arrays. No per-light data. Three uniforms total.

### `uLightGrid` texture format and lifecycle (Pixi v8 specifics)

**Pixi v8 wiring — write this exactly, or the upload silently no-ops:**

```ts
import {
  BufferImageSource,
  Texture,
  TextureSource,
} from "pixi.js";

// Cell buffer: 4 floats per cell, world-grid resolution.
// Bestiary: 30 cols × 20 rows × 4 = 2400 floats = 9.6 KB. Negligible.
// Dungeon-walk: 20 × 11 × 4 = 880 floats = 3.5 KB.
const grid_buf = new Float32Array(grid.cols * grid.rows * 4);

const tex_source = new BufferImageSource({
  resource: grid_buf,
  width: grid.cols,
  height: grid.rows,
  format: "rgba32float",          // exact, no clamping, no tonemap branch needed
  alphaMode: "no-premultiply-alpha",
  scaleMode: "linear",             // bilinear interp between cells = soft edges
  addressModeU: "clamp-to-edge",   // avoid wrap-around at world edges
  addressModeV: "clamp-to-edge",
});

const tex_light = new Texture({ source: tex_source });

// Each frame after writing grid_buf:
tex_source.update();              // marks dirty; Pixi re-uploads on next render

// Pass into Filter:
const filter = new Filter({
  glProgram: GlProgram.from({ vertex: VERTEX_GLSL, fragment: FRAGMENT_GLSL, name: "bst-light-grid" }),
  gpuProgram: GpuProgram.from({
    vertex: { source: WGSL, entryPoint: "mainVertex" },
    fragment: { source: WGSL, entryPoint: "mainFragment" },
  }),
  resources: {
    light: new UniformGroup({
      uAmbient: { value: ambient_buf, type: "vec3<f32>" as const },
      uGridSize: { value: grid_size_buf, type: "vec2<f32>" as const },
    }),
    uLightGrid: tex_source,         // texture binding by uniform name
  },
});
```

**Lifecycle gotchas — call these out in the coder task:**

1. **`scaleMode: "linear"` is non-default for float textures.** Pixi v8 defaults float textures to `nearest`. We *need* linear for the soft-edge effect. Set it explicitly on the `BufferImageSource` constructor.
2. **`addressModeU`/`addressModeV: "clamp-to-edge"`** prevents brazier glow wrapping to the opposite arena wall. Default in v8 is `clamp-to-edge` but be explicit; some platform backends differ.
3. **`format: "rgba32float"` requires `EXT_color_buffer_float`** on WebGL2 — universally supported on desktop/mobile browsers as of 2024. WebGPU is fine. If a coder hits a "format not supported" error in CI, the fallback is `format: "rgba8unorm"` with values scaled `* 0.5` and `* 2.0` in shader (see §9 Q2). **Do not implement the fallback unless an actual error surfaces** — premature ceremony.
4. **`tex_source.update()` is the dirty-flag signal.** Pixi only re-uploads if `update()` is called. Skipping this is the #1 way to ship a black screen and waste a deploy cycle. Always call after writing `grid_buf`.
5. **`BufferImageSource` keeps a reference to `grid_buf`.** Do not reassign `grid_buf` — mutate in place. (Standard Float32Array semantics, but `_=` reassign would silently uncouple the upload.)
6. **`Texture` is a thin wrapper; passing `tex_source` directly to `resources` works.** Pixi v8 unifies them; both are sampleable. Use `tex_source` (the source) as the resource value; the wrapping `Texture` is for sprite use, not filter binding.
7. **Filter binding name `uLightGrid` must match the shader sampler name exactly** in both GLSL and WGSL. Pixi v8 binds by uniform name. (In v2 we hit array-uniform syntax surprises; this is the equivalent trap for textures.)
8. **`highp` everywhere** on shared fragment uniforms (preserved from v2). The vertex shader copies v2's verbatim — no changes.

### GLSL ES 3.0 (fragment) — skeleton

```glsl
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;

uniform sampler2D uLightGrid;
uniform highp vec3 uAmbient;
uniform highp vec2 uGridSize;

out vec4 finalColor;

void main() {
  vec4 col = texture(uTexture, vTextureCoord);

  // Map vTextureCoord (0..1 of input texture) to grid UV (0..1 of grid texture).
  // Both are normalised to the same world pixel space (input texture covers the world Container,
  // which equals the grid in pixel size — uGridSize). So grid_uv == vTextureCoord.
  // Kept as a deliberate uniform for the edge case where they diverge (camera padding etc.).
  vec2 grid_uv = (vTextureCoord * uInputSize.xy) / uGridSize;

  vec4 g    = texture(uLightGrid, grid_uv);   // bilinear-filtered: g.rgb = light sum, g.a = eye visibility
  vec3 unseen = uAmbient * col.rgb;
  vec3 lit_target = col.rgb * (uAmbient + g.rgb);

  // Optional Reinhard tonemap on the lit branch only.
  // Y is per-pixel luminance; mapped keeps colour, bounded in [0, 1].
  float Y = max(lit_target.r, max(lit_target.g, lit_target.b));
  vec3 lit = lit_target / (1.0 + max(0.0, Y - 1.0));

  // g.a == 1 inside eye-light reach; smoothly < 1 just outside thanks to bilinear filter.
  finalColor = vec4(mix(unseen, lit, g.a), col.a);
}
```

### WGSL — parity

```wgsl
struct GlobalFilterUniforms {
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

// vertex stage: identical to v2 — no changes from existing code.

@fragment
fn mainFragment(@location(0) uv: vec2<f32>, @builtin(position) position: vec4<f32>)
  -> @location(0) vec4<f32>
{
  let col = textureSample(uTexture, uSampler, uv);
  let grid_uv = (uv * gfu.uInputSize.xy) / light.uGridSize;
  let g = textureSample(uLightGrid, uLightGridSampler, grid_uv);
  let unseen = light.uAmbient * col.rgb;
  let lit_target = col.rgb * (light.uAmbient + g.rgb);
  let Y = max(lit_target.r, max(lit_target.g, lit_target.b));
  let lit = lit_target / (1.0 + max(0.0, Y - 1.0));
  return vec4<f32>(mix(unseen, lit, g.a), col.a);
}
```

**WGSL sampler binding caveat:** in v2 we had one UniformGroup at `@group(1) @binding(0)`. v3 needs the group to also carry the `uLightGrid` texture and its sampler at `@binding(1)` and `@binding(2)`. **Verify the binding indices match Pixi v8's auto-layout** — the coder should `console.log` the pipeline reflection on first run to confirm. If Pixi v8 puts textures in a separate group, adjust accordingly. Test on both WebGL2 and WebGPU backends before commit.

### Skipping the Reinhard tonemap

The Reinhard `lit / (1 + max(0, Y-1))` only kicks in when `lit_target > 1` — i.e. when ambient + sum of contributing lights exceeds 1 on some channel. With `uAmbient = [0.04..0.12]` and per-light contributions typically `intensity * falloff_curve ≤ 1.0`, two overlapping lights at full intensity at the same cell would sum to `~2.0` before tonemap. Three+ overlapping lights at full intensity would clip without it.

**Decision: keep the tonemap.** It's a single line. The cost is one max + one divide per pixel. Removing it later (if profiling shows it matters) is trivial.

---

## §4 Grid math reference

### Per-tick update flow (inside `make_light_update_system`)

```ts
const update: System = (w, ctx) => {
  const is_blocking = resolve_is_blocking(w, ctx);
  if (!is_blocking) return;
  ls.update(ctx, is_blocking);
};

// Inside ls.update(ctx, is_blocking):
//
//   1. Clear grid_buf (Float32Array.fill(0)).
//   2. For each slot (including the eye slot at index 0):
//      a. If slot.dirty (set_pos called since last update) OR slot.cells_reached === null:
//           slot.cells_reached = g.line_of_sight({
//             from: { x: slot.pos_cx, y: slot.pos_cy },
//             radius: slot.radius_cells,
//             is_blocking,
//             include_origin: true,
//           });
//           slot.dirty = false;
//      b. If slot.is_eye:
//           for each cell_key in slot.cells_reached: grid_buf[cell_key * 4 + 3] = 1.0;
//         else:
//           t_flicker = (ctx.time.tick + ctx.time.alpha) * ctx.time.fixed_dt;
//           f = eval_flicker(slot.flicker, slot.seed, t_flicker);   // { i_mul, r_mul }
//           // r_mul is ignored in grid mode (radius is integer cell count; we don't shrink
//           // cells_reached per frame — that would defeat the LOS cache). i_mul applies.
//           for each cell_key in slot.cells_reached:
//             cell = g.unkey(cell_key);
//             d_grid = euclidean(slot.pos_cell, cell);
//             if (d_grid > slot.radius_cells) continue;          // Euclidean clip inside Chebyshev hull
//             t = d_grid / slot.radius_cells;                    // 0..1
//             fall = 1 - smoothstep(0, 1, pow(t, slot.falloff)); // matches v2 shape exactly
//             contrib = slot.intensity * f.i_mul * fall;
//             grid_buf[cell_key*4    ] += slot.color_r * contrib;
//             grid_buf[cell_key*4 + 1] += slot.color_g * contrib;
//             grid_buf[cell_key*4 + 2] += slot.color_b * contrib;
//   3. tex_source.update();
```

`g.unkey` is `(k) => ({ x: k % cols, y: Math.floor(k / cols) })` — already provided by `@f0rbit/forge/grid`.

### Distance metric — Euclidean over Chebyshev-bounded LOS

`g.line_of_sight` returns cells within `chebyshev <= radius` from the origin that have unobstructed line-of-sight (Bresenham). This is a square envelope (Chebyshev ball). For radial falloff we want a circular shape — so we filter cells to `euclidean <= radius` and apply `euclidean`-based falloff inside.

```ts
const euclidean = (a: Cell, b: Cell): number =>
  Math.hypot(a.x - b.x, a.y - b.y);
```

For the eye-light, the **circular vs square** question matters visually: a player who sees a wall corner shouldn't see "extra" diagonals beyond the radius. So the eye light *also* filters its `cells_reached` set to `euclidean <= eye_radius` before writing the A channel. Cheap (`O(cells)` once per LOS recompute) and gives a circular FOV that matches the existing `fov_system` behaviour.

```ts
// After g.line_of_sight returns `los_set: ReadonlySet<number>`:
const circular = new Set<number>();
for (const key of los_set) {
  const c = g.unkey(key);
  if (euclidean(c, slot.pos_cell) <= slot.radius_cells) circular.add(key);
}
slot.cells_reached = circular;
```

### Falloff curve

Matches v2 shape exactly so visuals stay consistent: `1 - smoothstep(0, 1, pow(t, falloff_exp))` where `t = euclidean_distance / radius_cells ∈ [0, 1]`. Default `falloff_exp = 1.4`. The brazier in §6's wiring uses `1.6` to keep its pool tighter (same value v2 used).

### Flicker integration

`flicker.ts` is **unchanged** from v2. The eval call signature is identical (`(profile, seed, t) => { i_mul, r_mul }`). The only difference is that `r_mul` is **ignored** in v3 — radius is integer cells and we don't want to re-run LOS at sub-cell precision per frame. The grid-LOS cache only invalidates on `set_pos`.

**Tradeoff documented:** v2 torch flicker had a coupled radius shimmer (~5% peak). v3 drops the radius shimmer; intensity shimmer remains. Visually subtle; if the user wants the radius shimmer back, options are (a) recompute LOS every N frames anyway (cheap — ~200 cells × 20-cell Bresenham each = nothing), or (b) shift the shimmer into a slight CPU-side colour modulation. **Default for v3: drop r_mul on lights, keep i_mul.** Re-evaluate if the visual loss is noticeable post-deploy.

The flicker clock remains `t = (ctx.time.tick + ctx.time.alpha) * ctx.time.fixed_dt`. Deterministic. Replay-safe.

### Cell-key indexing

`grid_buf` is laid out as `[cell0.r, cell0.g, cell0.b, cell0.a, cell1.r, ...]` row-major. Index for cell `(x, y)` is `(y * cols + x) * 4`. Use `g.key(x, y) * 4` to avoid recomputing the layout.

### Per-light LOS cost

Bestiary worst case: ~16 lights × ~600 cells in a 12-cell-radius ball × Bresenham 12 steps = ~115k integer steps per tick. Bun on Apple Silicon handles this in <0.5 ms. Bestiary today runs three lights and a single eye-light at 6-cell radius — actual cost is 4 × ~120 cells × 6 Bresenham steps = ~3k steps. Negligible.

---

## §5 Forge promotion stance

**Decision: stay game-side. Forge promotion candidate for v0.4.0.** Same reasoning as v2 §5:

1. Two consumers in a 7-subsystem repo. Promotion gate (per `PLAN.md`) is satisfied by count but the API has just changed shape — premature freezing.
2. The grid + texture upload pattern is new; let it bed in.
3. Doctrinal duplication is the explicit `AGENTS.md` cost.
4. Re-evaluate when the third consumer (likely `arena`) arrives or at the v0.4.0 forge bump, whichever comes first.

### Forge promotion checklist (record only — for v0.4.0)

- `flicker.ts` → `@f0rbit/forge/light/flicker`. Pure math, zero forge dependency.
- `shaders.ts` → `@f0rbit/forge/light/shaders`. Pixi is already a forge peer (`@f0rbit/forge/pixi`).
- The cell-grid math lives close to `@f0rbit/forge/grid` — the system itself probably wants to be `@f0rbit/forge/pixi/light` since it owns a `Filter`.
- Decide: does forge ship `eye_handle` as a core concept, or is "the player is a light" game-specific? **Lean: yes, ship it.** The pattern is broadly applicable to any top-down roguelike.

---

## §6 Phase A — replace bestiary lighting with grid system

**Owner:** one `coder` (default model). Sequential, single agent. Reason: the rewrite is cohesive — shaders, system, LOS integration, and game wiring need to land together. Parallelisation hurts.

**Estimated LOC:** rewrite ~360 LOC, edits ~80 LOC, deletions ~120 LOC. Net change ~+300.

**Devpad tasks to create at orchestrator level:** one per file group listed below, with the verification step as a separate task.

### A.1 — Rewrite `system.ts`

`subsystems/bestiary/src/systems/light/system.ts` (~280 LOC after edits).

New responsibilities:

- Construct `grid_buf: Float32Array(cols * rows * 4)` and `BufferImageSource` per §3.
- Maintain `slots: Slot[]` where `Slot` adds: `pos_cx`, `pos_cy`, `radius_cells`, `cells_reached: ReadonlySet<number> | null`, `dirty: boolean`, `is_eye: boolean`.
- Eye slot is `slots[0]` always — created during `make_light_system`, marked `is_eye: true`. Public `add` produces slots at index ≥1.
- Replace `update_uniforms` with `update(ctx, is_blocking)` per §4.
- Keep `set_pos`/`set_intensity`/`set_color`/`set_ambient`. `set_pos` marks the slot `dirty = true`.
- Keep `remove` with the swap-into-removed-index trick. Disallow removing the eye slot (no-op).
- Export `make_eye_follow_system`, `make_light_follow_system`, `make_marker_light_follow_system`, `make_light_update_system` per §2.
- Cell-coord clamping helper: `clamp_cell(x, y) => [max(0, min(cols-1, x|0)), max(0, min(rows-1, y|0))]`.

### A.2 — Rewrite `shaders.ts`

`subsystems/bestiary/src/systems/light/shaders.ts` (~90 LOC, down from 152).

- Strip uniform arrays, cone math, light loop. Add `uLightGrid` sampler + `uGridSize` vec2.
- Single export `make_shaders()` (no `max_lights` parameter — there isn't one).
- Vertex shader is **unchanged** from v2; copy verbatim.
- Fragment shaders per §3 skeletons.

### A.3 — Leave `flicker.ts` untouched

`subsystems/bestiary/src/systems/light/flicker.ts`. No edits. The flicker test `subsystems/bestiary/test/light-flicker.test.ts` continues to pass without changes — same functions, same signatures, same determinism.

### A.4 — Leave `presets.ts` untouched

Treat `default_torch_radius` as cell count for v3 callers. The bestiary preset `moon_cavern` was `96` (px); divided by `tile = 16` → 6 cells. **Update the preset values to cells** in-place to avoid magic-number conversion at call sites:

| Preset | v2 `default_torch_radius` (px) | v3 `default_torch_radius` (cells) |
|---|---:|---:|
| `moon_cavern` | 96 | 6 |
| `warm_torch` | 88 | 6 |
| `frostbite` | 96 | 6 |
| `lab` | 110 | 7 |
| `sunset` | 96 | 6 |
| `hellscape` | 80 | 5 |

Update the JSDoc to note the field is in cells. The field name stays `default_torch_radius`.

### A.5 — Delete `fov.ts`

`subsystems/bestiary/src/systems/fov.ts` → **DELETE.** Eye-light replaces it.

### A.6 — Update `plugin.ts`

- Remove `import { fov_system } from "./systems/fov.ts"` and its `sch.add("post", fov_system, "bst.fov")`.
- Replace `player_light_follow_system(opts.light, opts.player_torch)` with `make_eye_follow_system(opts.light, g, visual_pos_c, player_c)`.
- Replace `make_marker_light_follow_system(opts.light, opts.summoner_glow, summoner_c, visual_pos_c)` with the v3-signature variant (takes `g` and uses cell coords internally).
- Replace `light_uniforms_system(opts.light)` on `"render"` with `make_light_update_system(opts.light, g, (w, ctx) => { const r = ctx.res.get(arena_r); return r.ok ? (cell => !r.value.floors.has(g.key(cell.x, cell.y))) : null; })`. Name the registered system `"bst.light_update"`.
- The `GamePluginOpts.player_torch` field can be removed — the eye light replaces it. `summoner_glow` stays (it's a regular coloured light, not the eye).
- **Sprite-visibility consequence:** v2's `fov_system` was hiding sprites outside FOV (`sprite.set(w, id, { alpha: 0, visible: false })`). In v3 we don't hide sprites — the shader's `g.a` makes them invisible by mapping to ambient-only. **This means all sprites are always drawn, just shaded out**. Performance cost is ~30 extra sprites worth of draw calls; trivial.
  - **Caveat:** there might be sprites the user genuinely never wants drawn (e.g. spawned-but-not-active enemies). Inspect `sprite-attach.ts` for any latent assumptions about visibility-as-gating. If a system reads `sprite.visible` to gate sim logic, that's a leak — flag in plan.
  - **Inspection result:** `subsystems/bestiary/src/systems/sprite-attach.ts` does not read `sprite.visible`. `fov_system` was the only writer. Safe to delete.

### A.7 — Update `main.ts`

`subsystems/bestiary/src/main.ts` (~25 LOC of edits).

- Change `make_light_system({ design, ambient, max_lights })` → `make_light_system({ grid: { cols: g.cols, rows: g.rows, tile: g.tile }, ambient: presets.moon_cavern.ambient, eye_radius: 6 })`.
- Remove the `player_torch` `ls.add` — eye light is implicit via `ls.eye_handle`.
- Brazier light: change `pos_px: [brazier_world.x + g.tile / 2, brazier_world.y + g.tile / 2]` → `pos_cell: [brazier_cells[0]!.x, brazier_cells[0]!.y]`. Change `radius_px: 64` → `radius_cells: 4`.
- Summoner glow: change `pos_px: [0, 0]` → `pos_cell: [0, 0]`. Change `radius_px: 56` → `radius_cells: 4`.
- Drop `player_torch` from `game_plugin` opts; keep `summoner_glow` and `light`.

```ts
const ls = make_light_system({
  grid: { cols: g.cols, rows: g.rows, tile: g.tile },
  ambient: presets.moon_cavern.ambient,
  eye_radius: 6,
});

// Eye light is ls.eye_handle — no explicit add().

const brazier_cell = brazier_cells[0]!;
ls.add({
  pos_cell: [brazier_cell.x, brazier_cell.y],
  color: [1.0, 0.55, 0.25],
  radius_cells: 4,
  intensity: 0.85,
  falloff: 1.6,
  flicker: { kind: "torch", amount: 0.18, seed: 2 },
});

const summoner_glow = ls.add({
  pos_cell: [0, 0],
  color: [0.6, 0.3, 0.9],
  radius_cells: 4,
  intensity: 0.75,
  flicker: { kind: "candle", amount: 0.15, seed: 3 },
});

// ...
game_plugin(app.world, app.schedule, {
  telegraph_render,
  debug_overlay,
  light: ls,
  summoner_glow,
});
```

### A.8 — Update `light-flicker.test.ts` — only if signatures shift

`subsystems/bestiary/test/light-flicker.test.ts` currently tests the `flicker.ts` exports. Those exports are unchanged. **No edits required.** Verify by running `bun test light-flicker` before and after; should be identical green.

### A.9 — Visual smoke checklist (Phase A)

After `bun run build` + `bun run dev`:

- [ ] Player walks; eye-light follows. The world outside ~6 cells is dim (ambient only); inside is lit.
- [ ] Brazier at cell `(8, 6)` casts a warm orange pool visible from outside the player's immediate FOV (the brazier's RGB is in `g.rgb` even where `g.a == 0`, so it should appear as "warm haze on far walls"). Note: this is a *behavioural change* from v2/v1, where pre-discovered cells were black until walked-into. Confirm the user is happy with seeing distant brazier glow before walking near it. If not, gate `g.rgb` by `g.a` in the shader: `lit_target = col.rgb * (uAmbient + g.rgb * g.a)`. This restores the "fog of war" feel. **Default: do not gate.** It's the "global lighting" feel the user asked for.
- [ ] Summoner glow follows the summoner sprite (purple-magenta).
- [ ] No Chebyshev *square* visible at the edge of FOV — eye light should be circular per §4.
- [ ] Walls cut the lighting: standing next to a pillar, no light leaks through to the other side.
- [ ] Sprites outside FOV are invisible (their pixels are `ambient * col.rgb`; sprites with colour `~0.0..0.2` against dark ambient ~`0.04..0.08` end up ~black, which is indistinguishable from "hidden").
- [ ] Soft bilinear edges visible at light boundaries (~half-cell transition).
- [ ] Three lights flicker independently (torch on brazier, candle on summoner glow, none on eye).
- [ ] Telegraph / debug overlay still render correctly (they're outside the world Container's filter, so unaffected — but verify).
- [ ] Replay test hash `20c9832ca030720900393ef4d8e12473bb120e1b743f7ea4d05896be2263fbf8` still matches.

### A.10 — Phase A verification + commit

Verification coder runs:

```
cd ~/dev/echo
bun test                                    # all subsystems' tests
cd subsystems/bestiary && bun run typecheck
cd subsystems/bestiary && bun run build
```

All green. Then commit:

```
feat(bestiary): unified grid-LOS lighting (eye-light replaces fov)

Lighting v3 — single concept covers visibility + illumination.
Per-tick CPU grid LOS per light writes a Float32 RGBA texture
sampled in a tiny fragment shader. The player is an "eye light"
whose cells_reached drive the alpha channel.

Replaces:
- per-pixel uniform-array shader (lighting v2)
- per-sprite alpha fov system

Replay hash unchanged: 20c9832c...263fbf8.

BREAKING: LightSpec.pos_px -> pos_cell; radius_px -> radius_cells;
LightCone removed. Both consumers updated.
```

---

## §7 Phase B — migrate dungeon-walk to grid system

**Owner:** one `coder-fast` (Haiku 4.5). Mechanical copy + tiny rewire. Depends on Phase A landing.

**Estimated LOC:** ~370 (copy) + ~20 (edits) + ~210 (deletes). Net change ~+170 (the copy is most of it).

### B.1 — Copy the `light/` folder verbatim

```
cp -r subsystems/bestiary/src/systems/light subsystems/dungeon-walk/src/systems/light
```

Folder must be byte-identical after the copy. **Verification: `diff -r subsystems/bestiary/src/systems/light subsystems/dungeon-walk/src/systems/light` must output nothing.**

### B.2 — Copy the flicker test

```
cp subsystems/bestiary/test/light-flicker.test.ts subsystems/dungeon-walk/test/light-flicker.test.ts
```

Edit only the relative path in the import if it differs (it should not — both subsystems have the same layout).

### B.3 — Delete `fov.ts`

`subsystems/dungeon-walk/src/systems/fov.ts` → **DELETE.** Same reason as bestiary.

### B.4 — Delete old `light.ts`

`subsystems/dungeon-walk/src/systems/light.ts` (162 LOC v1 single-source filter) → **DELETE.** Replaced by the `light/` folder.

**Note:** dungeon-walk never received v2; it still ships the v1 `LightFilter`. Phase B jumps it straight from v1 → v3. The migration is `make_light_filter(design, palette) + light_follow_system(filter)` → `make_light_system({ grid, ambient, eye_radius }) + make_eye_follow_system + make_light_update_system`.

### B.5 — Rewire `main.ts`

`subsystems/dungeon-walk/src/main.ts`:

```ts
// before
const light = make_light_filter(design, { ambient: [0.08, 0.04, 0.02], falloff: 1.6 });
// ...
game_plugin(app.world, app.schedule, { light });
```

```ts
// after
import { make_light_system, presets } from "./systems/light/index.ts";

const ls = make_light_system({
  grid: { cols: g.cols, rows: g.rows, tile: g.tile },
  ambient: presets.warm_torch.ambient,
  eye_radius: 6,
});
// No explicit player torch — eye light is implicit. Single light = the player.
// ...
app.render.world.filters = [ls.filter];
game_plugin(app.world, app.schedule, { light: ls });
```

**Visual change:** the v1 dungeon-walk had a single light that illuminated *coloured* cells in a warm pool. v3's eye-light is colourless (alpha only). To preserve the warm-torch feel, add **one explicit coloured light that follows the player** in addition to the eye-light:

```ts
const player_torch = ls.add({
  pos_cell: [0, 0],
  color: presets.warm_torch.default_torch_color,
  radius_cells: presets.warm_torch.default_torch_radius,  // 6
  intensity: 0.95,
  falloff: 1.6,
  flicker: { kind: "torch", amount: 0.12, seed: 1 },
});
```

Then have an eye-follow system *and* a generic-follow system for the player_torch — both follow the player. Two follow registrations, both cell-space, near-zero cost.

Update `g` import — dungeon-walk's `grid.ts` exports `g`. Confirm `g.cols=20, g.rows=11, g.tile=16` (already verified). No grid changes.

### B.6 — Rewire `plugin.ts`

`subsystems/dungeon-walk/src/plugin.ts`:

- Drop `import { fov_system } from "./systems/fov.ts"` and its `sch.add("post", fov_system, "dw.fov")`.
- Drop `import { type LightFilter, light_follow_system } from "./systems/light.ts"`.
- Add `import { type LightSystem, type LightHandle, make_eye_follow_system, make_light_follow_system, make_light_update_system } from "./systems/light/index.ts"`.
- `GamePluginOpts` becomes `{ light?: LightSystem; player_torch?: LightHandle }`.
- Replace `light_follow_system(opts.light)` registration with:
  ```ts
  sch.add("post", make_eye_follow_system(opts.light, g, visual_pos_c, player_c), "dw.eye_follow");
  // Plus the coloured torch following the player too:
  if (opts.player_torch) {
    sch.add("post", make_light_follow_system(opts.light, g, opts.player_torch, /* player_id */ ?, visual_pos_c), "dw.torch_follow");
  }
  ```
- Resolve the player id once at startup (it's spawned in `dungeon_gen_system`). Cleanest: write a `make_player_marker_light_follow_system` that uses `player_c` as a marker (same pattern as the bestiary summoner). Or just use `make_marker_light_follow_system(ls, g, player_torch, player_c, visual_pos_c)` — it's already in the API.
- Add `sch.add("render", make_light_update_system(opts.light, g, (w, ctx) => { const r = ctx.res.get(dungeon_r); return r.ok ? (cell => !r.value.floors.has(g.key(cell.x, cell.y))) : null; }), "dw.light_update");`.

### B.7 — Visual smoke checklist (Phase B)

- [ ] Warm orange torch on the player, follows movement.
- [ ] Dungeon walls block the light correctly (no leakage through a wall).
- [ ] Floor cells beyond the eye radius are dark (`ambient * col.rgb`).
- [ ] Exit tile visible from far away as a darker shape (no eye coverage) but ambient still shows colour — same fog-of-war question as bestiary §A.9.
- [ ] Replay test stays green. dungeon-walk's `replay.test.ts` uses a `"r=…|f=…|n=…"` string hash (no hex sha256) — confirmed by inspection. Should not change.
- [ ] `fov-symmetry.test.ts` — this test pre-dates v3 and likely tests properties of `fov_system`. **Risk: this test may fail if it touches deleted code.** Check the import paths during Phase B. If it imports `fov_system`, the test must be **deleted or rewritten to test the eye-light's `cells_reached` symmetry directly**. *Recommend: rewrite, since the symmetry property is still valuable and the eye-light still uses `g.line_of_sight`.*
- [ ] `bun run dev`, walk through the dungeon, reach the exit, see win overlay — same flow as before.

### B.8 — Phase B verification + commit

```
cd ~/dev/echo
bun test
cd subsystems/dungeon-walk && bun run typecheck
cd subsystems/dungeon-walk && bun run build
diff -r subsystems/bestiary/src/systems/light subsystems/dungeon-walk/src/systems/light
```

Last command must output nothing. Then commit:

```
feat(dungeon-walk): unified grid-LOS lighting

Migrates from v1 light filter + fov system to v3 grid lighting.
Eye light replaces fov; one warm player torch on top supplies colour.

Replay hash unchanged.
fov-symmetry.test.ts rewritten to assert symmetry on the eye light's
cells_reached set directly.
```

---

## §8 Verification (cross-phase)

### What runs (Phase A + Phase B both green required)

```
cd ~/dev/echo
bun test                                                    # both subsystems
cd subsystems/bestiary       && bun run typecheck && bun run build
cd subsystems/dungeon-walk   && bun run typecheck && bun run build
diff -r subsystems/bestiary/src/systems/light \
        subsystems/dungeon-walk/src/systems/light            # must be empty
```

### Replay invariants

- `subsystems/bestiary/test/replay.test.ts` — tick-600 world hash `20c9832c…263fbf8` unchanged. The "two consecutive runs produce byte-identical hashes" test stays green.
- `subsystems/dungeon-walk/test/replay.test.ts` — score string `r=true|f=N|n=M` reproduces. Test does not pin a hex hash.

### Manual visual regression

| Subsystem | Pre-v3 look | v3 look | Acceptable? |
|---|---|---|---|
| bestiary | cool moon ambient, three lights, **per-sprite hard FOV cutoff** (square Chebyshev edge from `fov_system`) | cool moon ambient, three lights, **circular eye light + soft bilinear edges** | Yes — this is the explicit user goal |
| bestiary | brazier glow visible only within 6 cells of player | brazier glow visible everywhere (its RGB is in `g.rgb`) | **DECISION POINT** — see §A.9. Default = visible everywhere ("global lighting"). Override = multiply `g.rgb` by `g.a` for fog-of-war. |
| dungeon-walk | warm torch only, dimming radially around player, hard square edge at radius 6 | warm torch + circular eye light, soft bilinear edge | Yes |

### Failure modes specific to v3

1. **Black screen.** Most likely: `tex_source.update()` not called. Second-most-likely: shader sampler name mismatch (`uLightGrid` in TS vs shader). Third: `format: "rgba32float"` rejected by browser → fall back to `rgba8unorm` per §3 gotcha 3.
2. **Bilinear interpolation looks wrong** (e.g. "blurry / not pixelated enough"). The world sprites are still rendered with their own (nearest) sampler. The bilinear sampler only applies to the per-cell light texture. If the lighting boundaries are too soft, drop to `scaleMode: "nearest"` — gives crisp per-cell edges.
3. **Light wraps to opposite edge.** `addressModeU`/`V` not `clamp-to-edge`. Default in v8 is clamp but be explicit.
4. **Replay hash differs.** Lighting leaked into sim. Inspect `ls.update` for any `w.set` / `ctx.res.set` calls — there must be none. The `update` system writes to `grid_buf` and `tex_source` only.
5. **`fov-symmetry.test.ts` fails post-delete.** Expected; rewrite per §B.7.
6. **Sprites outside eye reach are visible.** v2 used `sprite.set(w, id, { alpha: 0 })` in `fov_system`. v3 doesn't hide sprites — relies on the shader making `ambient * col.rgb` look dark. If sprite source colours happen to be bright (e.g. white player sprite), they'll still show. Mitigation: tune ambient down to `[0.02, 0.02, 0.04]` or accept the "outline visible in the dark" feel. **Recommend: leave it.** The eye-light's alpha falls off softly at the boundary, so sprites just outside FOV appear dim — visually fine.

### Post-deploy

```
https://f0rbit.github.io/echo/bestiary/         # three lights, circular FOV, soft edges
https://f0rbit.github.io/echo/dungeon-walk/     # warm torch, circular FOV, soft edges
```

---

## §9 Resolved decisions (the 8 open questions)

1. **Distance metric.** Euclidean falloff applied to cells inside the Chebyshev LOS hull. The eye light additionally filters its `cells_reached` set to `euclidean <= eye_radius` so visibility is circular. `g.line_of_sight` itself returns a Chebyshev-bounded set — we trim down to a circular ball in JS. Cheap; matches the desired visual.

2. **Texture format.** `rgba32float` via `BufferImageSource`. ~9.6 KB for bestiary, ~3.5 KB for dungeon-walk — nothing. Avoids the `rgba8unorm` clamp/wrap branch entirely and matches the in-JS `Float32Array` we're already maintaining. If a CI browser rejects the format (unlikely; `EXT_color_buffer_float` is universal), fall back per §3 gotcha 3.

3. **Grid resolution.** Match `g.cols × g.rows` exactly — verified: bestiary `30 × 20`, dungeon-walk `20 × 11`. (Plan prompt said 32×20 for bestiary; that's wrong. Confirmed against `subsystems/bestiary/src/grid.ts:3`.) Bilinear interpolation gives ~half-cell soft edges, which is the desired "soft wall" effect.

4. **LOS caching strategy.** Per-light `cells_reached` cache invalidated by `set_pos`. Static lights (brazier) compute once. Moving lights (eye, summoner_glow) recompute every tick because the eye-follow / marker-follow system calls `set_pos` each post-stage tick. Per §4 cost estimate, this is ~3k Bresenham steps per tick on bestiary — well under 0.5 ms.

5. **Eye-light intensity field.** Eye light is a regular `LightSpec` slot with internal `is_eye: true` flag. Its `intensity` is 0 (no RGB contribution); its `cells_reached` drives only the A channel. Auto-created at construction. `add()` cannot create more; `remove(eye_handle)` is a no-op. Simplest path; preserves slot uniformity.

6. **Bilinear filtering at world edges.** `addressModeU` / `addressModeV` = `clamp-to-edge`. Prevents the brazier's edge cell wrapping to the opposite side of the world. Default in Pixi v8 is clamp; pass it explicitly anyway because some backends differ.

7. **Eye-light flicker.** Ignored. Even if a caller calls `set_intensity(eye_handle, …)` or constructs a `LightSpec` with a flicker profile and `is_eye: true`, the alpha channel is binary cell-membership. A flickering FOV would feel like a seizure. Documented in `make_light_system` JSDoc.

8. **Forge promotion.** Stay game-side. Re-evaluate at v0.4.0 or third-consumer arrival, whichever comes first. Recap in §5.

### Additional decisions surfaced during planning

- **`fov-symmetry.test.ts` in dungeon-walk** — currently tests symmetry property of `fov_system` (not seen during this planning pass, but exists). Rewrite to assert symmetry on the eye-light's `cells_reached` set directly, since the eye light *is* the new FOV. Same `g.line_of_sight` underneath — the test value isn't lost.
- **Fog-of-war vs global lighting.** v3 default shows distant brazier glow even before the player walks near. If user prefers fog-of-war (cells you haven't seen are pure ambient, no RGB contribution from any light), one-line shader change: `lit_target = col.rgb * (uAmbient + g.rgb * g.a)`. **Default: no FOW gating.** It's the "unified lighting" feel the user asked for. Mention to user post-deploy so they can review.
- **Sprite visibility outside FOV.** v3 does not hide sprites via `sprite.set({ alpha: 0 })`. The shader's ambient-only output makes them effectively invisible. Sprites with bright source colours may show as "outlined in the dark" — acceptable for v3. If unacceptable, restore a minimal `fov_system` that only sets alpha on enemy sprites; doesn't conflict with the unified concept.

---

## §10 What the user should eyeball post-deploy

Three checks after `main` builds and GH Pages updates:

1. **Bestiary — visual concept check.** Walk player around. The FOV is now a soft-edged *circle*, not a square. The brazier at cell (8, 6) is visible as a warm orange pool. Outside the FOV the brazier *still glows*, illuminating distant walls. This is the "unified lighting" concept — confirm it reads well. If you wanted fog-of-war (brazier invisible until walked near), reply with "gate g.rgb by g.a" and a follow-up commit lands the one-line shader change.

2. **Dungeon-walk — warm-torch parity.** The warm-torch feel from v1 should be preserved (player carries a warm pool). The square edge from v1's fov system is gone — now circular + softer. Walls still block. Reaching the exit triggers the win overlay as before.

3. **Performance — frame rate.** Both subsystems should comfortably hold 60 fps. Per-tick LOS is well under 1 ms; texture upload is ~10 KB. If frame rate drops noticeably *only on certain GPUs*, suspect `rgba32float` support — escalate to fall back to `rgba8unorm` per §3 gotcha 3.

---

## Task index (for devpad mirroring, in execution order)

| # | Task | Phase | Owner | Files | Est LOC |
|---:|---|---|---|---|---:|
| 1 | Rewrite `system.ts` for grid + cells_reached cache + eye slot | A | `coder` | `subsystems/bestiary/src/systems/light/system.ts` | ~280 |
| 2 | Rewrite `shaders.ts` for single texture sampler + uGridSize | A | `coder` (same) | `subsystems/bestiary/src/systems/light/shaders.ts` | ~90 |
| 3 | Update `presets.ts` so `default_torch_radius` is cells, not px | A | `coder` (same) | `subsystems/bestiary/src/systems/light/presets.ts` | ~15 |
| 4 | Delete `fov.ts`; update `plugin.ts` (drop fov_system, swap light follow + update systems) | A | `coder` (same) | `subsystems/bestiary/src/systems/fov.ts`, `subsystems/bestiary/src/plugin.ts` | -60 / +20 |
| 5 | Update `main.ts` for grid config, pos_cell, eye_handle | A | `coder` (same) | `subsystems/bestiary/src/main.ts` | ~25 |
| 6 | **Phase A verification** — typecheck, replay hash, build, visual smoke, commit | A verify | `coder` (verification mode) | — | — |
| 7 | `cp -r` light/ folder to dungeon-walk; `cp` flicker test | B | `coder-fast` | `subsystems/dungeon-walk/src/systems/light/*`, `subsystems/dungeon-walk/test/light-flicker.test.ts` | ~380 (copy) |
| 8 | Delete `light.ts` and `fov.ts` in dungeon-walk | B | `coder-fast` (same) | `subsystems/dungeon-walk/src/systems/light.ts`, `subsystems/dungeon-walk/src/systems/fov.ts` | -210 |
| 9 | Rewire dungeon-walk `main.ts` + `plugin.ts` with eye + player_torch | B | `coder-fast` (same) | `subsystems/dungeon-walk/src/{main,plugin}.ts` | ~25 |
| 10 | Rewrite `fov-symmetry.test.ts` to assert on eye-light cells_reached | B | `coder-fast` (same) | `subsystems/dungeon-walk/test/fov-symmetry.test.ts` | ~40 |
| 11 | **Phase B verification** — diff -r vs bestiary, typecheck, replay, build, visual smoke, commit | B verify | `coder` (verification mode) | — | — |

---

## Suggested AGENTS.md updates

Append to `~/dev/echo/AGENTS.md` after this work lands (only with user approval):

```md
## Lighting (v3)

Lighting is the visibility model. Each light computes `cells_reached` via `g.line_of_sight`
on the CPU; per-cell RGBA is written to a `BufferImageSource` and sampled in a tiny fragment
shader. The player is an "eye light" — its alpha channel *is* the FOV. There is no separate
`fov_system`.

Per-light LOS is cached and invalidated on `set_pos`. Lights computed once for static
brazier-like sources; per-tick for the eye light and entity-followed lights.

Same doctrinal duplication as v2: bestiary and dungeon-walk ship byte-identical copies of
`src/systems/light/`. Forge promotion still deferred to v0.4.0.

The light update system runs on the `"render"` schedule stage and never writes to world or
resources. Replay hashes must remain stable across lighting changes.
```

---

## Acknowledged grid sizes (verified during planning)

- `subsystems/bestiary/src/grid.ts:3` — `grid({ cols: 30, rows: 20, tile: 16 })` → `480 × 320` design pixels, **600 cells**, 2400 floats, 9.6 KB texture.
- `subsystems/dungeon-walk/src/grid.ts:3` — `grid({ cols: 20, rows: 11, tile: 16 })` → `320 × 176` design pixels, **220 cells**, 880 floats, 3.5 KB texture.

(The original prompt said bestiary was 32×20 — that's incorrect; the source of truth is the file above.)
