# arena — subsystem plan

> Status: scoping. No code in `subsystems/arena/` yet. The user reviews + approves this doc before any scaffolding.
>
> Audience: future Claude sessions, future agents, the user. Single source of truth for the `arena` subsystem.
>
> Parents: `~/dev/echo/PLAN.md` §4.3 (subsystem catalogue entry), §5 (forge promotion gates), §7 Phase 3 (LOC table). `~/dev/echo/AGENTS.md` "Rendering conventions" (non-negotiable; bestiary + dungeon-walk already proved these out).
>
> Sibling reference: `subsystems/bestiary/` is the structural template — same package shape, same replay-as-test pattern, same `arena_r` + run-seed restart pattern.

---

## 1. Goals and non-goals

### Goals

- **Tactile combat.** Pillar P5 of `echo` PLAN.md. The subsystem exists to get hit feedback right: hitstop, camera shake, particle bursts, sprite flash, screen flash. "Feel good" is the deliverable.
- **Mechanics scope (per PLAN.md §4.3):**
  - 320×180 single-room arena. Boundary walls only.
  - Player with melee (Z = 90° arc in front, instant) + ranged (X = 4-tile/sec projectile).
  - Three waves × 5 weak chasers. Win = clear all 3 waves. Lose = 3 hits taken.
  - Punching-bag dummy in the centre — never dies, available for free-form feedback testing.
- **Replay-as-test gate.** `replays/wave-clear.replay.json` (seed 1) asserts `wave_r.total_kills === 15`, `health_r.current > 0`, and at least one `particles_r.entries[]` entry on each kill tick (see §6).
- **Debug fixture page.** `subsystems/arena/debug/` companion that deterministically exercises hitstop + shake + flash + particles (per AGENTS.md "Debug fixture pattern"). Enables autonomous visual verification via Chrome DevTools.
- **Forge promotion candidates surfaced**, not landed in this phase — particles ring-buffer (`forge.fx`), camera-shake API, `time.scale_for` helper. PLAN.md predicted v0.3.0 alongside arena; forge has since shipped v0.4.2, so this subsystem's forge contribution is a **v0.4.3 patch or v0.5.0 minor** depending on whether breaking changes are warranted (see §4 + §7).

### Non-goals

- Multi-player. Single-player arena only.
- Real art. Coloured-square sprites + `__default__` atlas (matches bestiary + dungeon-walk).
- Inventory / loot drops. (Phase 4: `loot`.)
- XP / progression. (Phase 5: `progress`.)
- FOV / lighting darkness. (No fog of war here; lighting *is* used for cosmetic hit-glow flashes — see §2 design Q4.)
- Bosses, scripted sequences. (Phase 6: `boss`.)
- Audio. Out-of-scope through Phase 8 per PLAN.md OQ-6.

---

## 2. Design questions resolved (with rationale)

### Q1. Continuous vs cell-step movement

PLAN.md §4.3 implies sub-cell positions ("4-tile speed" projectile, "90° melee arc"). Bestiary + dungeon-walk both use cell-step movement via `g.move_tile`.

**Decision: continuous movement for arena entities.** Player + chasers + projectiles all carry `pos_c` in continuous world coords (pixels); no `g.move_tile` calls. `dir_c` becomes a unit-vector `{ dx: number; dy: number }` (not the `-1|0|1` snap-step variant bestiary uses).

**Rationale:**
- A 90° arc swept around the player only makes geometric sense in continuous space. Cell-snapping the swing means the arc only covers 1–3 cells at any 22.5° rotation — visually broken.
- 4-tile/sec projectile = 64 px/sec = ~1.07 px/tick at 60 Hz. Sub-cell granularity is mandatory.
- The chaser AI gets simpler: gradient toward player position (normalize delta, scale by `speed_per_tick`), no A* needed for boundary-only walls.
- This is a **deliberate divergence from bestiary**. We do NOT reuse bestiary's `tween.ts` or `visual_pos_c` — `pos_c` itself is the rendered position. Saves ~30 LOC.

**Implications:**
- New component `vel_c { vx: number; vy: number }` for projectiles (px/tick).
- Hit detection is **circle vs circle** (`dx*dx + dy*dy < r2`) for projectile-vs-chaser; **arc-vs-circle** for melee (angle-between-player-dir-and-target-delta, magnitude bounded by reach). Hand-written, ~25 LOC.
- Wall collision = clamp `pos_c.x/y` to `[radius, design_w - radius]` after every integration step. No autotile, no `wall_index_r`. (See Q5.)
- `g.world_to_cell` is still useful for particle clustering / spatial debug, but not for movement.

### Q2. Hitstop replay-determinism

`time.scale = 0` is unworkable as a hitstop mechanism. See the §2 Q2 alternative analysis (option (d), originally in §6) for the corrected approach.

**Confirmed forge behaviour** (`forge/src/time.ts` + `forge/src/pixi/index.ts`):
- `time.advance(real_dt, each)` increments `state.accumulator += real_dt * scale`. With `scale = 0`, accumulator stays put.
- The `each` callback (wired in `boot()` to `sch.tick(w, ctx_obj)`) fires once per consumed simulation tick. With `scale = 0`, no consumption, **`sch.tick` does not run at all** — including the `pre`-stage release system. **Result: permanent deadlock**, because the system that's supposed to restore `scale = 1` itself depends on a tick that will never come.
- `state.tick` does not advance. Periodic systems (`{ every, phase }`) gate on `ctx.time.tick % every`, so they also pause. Replay's `tick`-keyed action events do not fire while frozen.

**Decision: hitstop is a per-system game-state gate, not a `time.scale` change.** `hitstop_r.remaining` is set to `HITSTOP_TICKS` on a hit; a `pre`-stage `hitstop_release_system` decrements it each tick. Every gameplay system (`input`, `movement`, `combat-melee`, `combat-ranged`, `enemy-ai`, `waves`, `particles` emit + advance) early-returns when `remaining > 0`. The release system itself is NOT gated — it's the countdown. `ctx.time.scale` is never mutated by arena code.

Render-adjacent systems (`flash`, `camera-shake` push/apply, `light-fx`) intentionally keep ticking — they read render state, not simulation state, and the visual cost of letting shake/lights decay through 4 ticks of hitstop is imperceptible. Their decay arithmetic continues; sprite positions stay frozen because `pos_c` doesn't change. That's the visual freeze.

**Replay determinism — preserved unconditionally.** `time.tick` advances normally; replay-recorded actions still fire on their tick; world hash is identical across runs (since the gated systems write nothing to the world during hitstop).

**No `time.scale_for(ticks, scale)` helper needed.** A handful of `if (hs.ok && hs.value.remaining > 0) return;` early-returns + one pre-stage decrement does the job game-side. If `boss` or `progress` reuse the pattern, lift it (a gate-helper function) game-side first, promote to forge only after the 2-consumer threshold.

### Q3. Camera shake — where does the offset live?

AGENTS.md "Rendering conventions": **`app.render.world` has no parent transform** — the design→window scale lives on `surface_sprite` which is a child of `app.stage`. `world.toLocal()` returns identity, so any "scale up the world container" approach is broken.

**Forge state (verified):** no `camera.set_offset()` API exists. `Viewport.offset` is the letterbox-centering offset, recomputed by `compute_viewport` every resize — read-only from game code.

**Decision: game-side shake mutates `surface_sprite.position` directly via a `render`-stage system that runs *after* `forge.render`.** Pattern:

```ts
// arena.ts post-render-stage system, registered AFTER forge.render
const apply_shake: System = (_w, ctx) => {
  const sh = ctx.res.get(camera_shake_r);
  if (!sh.ok) return;
  const { magnitude, decay, seed_tick } = sh.value;
  if (magnitude < 0.01) {
    surface_sprite.position.set(vp.offset.x, vp.offset.y);
    return;
  }
  // deterministic shake — sample from rng forked by seed_tick
  const r = make_rng(seed_tick);
  const ox = (r.float() * 2 - 1) * magnitude;
  const oy = (r.float() * 2 - 1) * magnitude;
  surface_sprite.position.set(vp.offset.x + ox, vp.offset.y + oy);
  sh.value.magnitude *= decay;
};
```

**Why on `surface_sprite`, not `app.stage` or `world`:**
- `app.stage` contains `surface_sprite` AND `debug_overlay` AND `palette_overlay`. Shaking `app.stage` shakes the HUD and palette UI too — wrong.
- `world` has identity transform; mutating its position wouldn't translate the world (the world is rendered to a RenderTexture sized to design viewport, then composited via surface_sprite scale + offset). Mutating `world.position` shifts world content within the RenderTexture, but the texture is then re-positioned by surface_sprite — net visual: world shifts in screen space, but at design resolution (1 px shake = 1 design-px = visually large at integer scale). Not the right granularity for a 320×180 design canvas.
- `surface_sprite.position` is in *window* space; the shake mutation applies *after* viewport math. A 1-pixel shake = 1 device pixel = subtle even at 6× integer scale. Correct granularity.

**Forge promotion candidate (record, do not ship in this phase):** a `forge.camera.set_screen_offset(x, y)` API that wraps this surface_sprite mutation. Wait for `boss` (which also wants shake) before promoting. Until then, arena game-side code reaches into `app.render` via `boot()` opts to get the surface_sprite reference — see §4.

**Replay determinism — preserved.** Shake offset is render-only, computed from a tick-seeded rng fork. Replay world-hash never observes it.

### Q4. Use `@f0rbit/forge/light` for screen flash / hit glow?

Forge v0.4.0 promoted lighting (eye-light + scene presets + flicker profiles). Bestiary uses it (`moon_cavern` preset + per-creature glows). Arena has no FOV — does it want lighting at all?

**Decision: yes, lighting filter ON but `ambient = (1, 1, 1)` (full bright).** Use one `LightHandle` per active feedback effect:
- **Screen flash (melee swing).** Brief full-screen white pulse. Add a single very-large-radius white light at the player's position, ramp intensity 1.0 → 0 over ~8 ticks.
- **Hit glow.** Per-impact, short-lived red/orange light at the hit point, ramps over ~12 ticks.

**Rationale:**
- Lighting filter is GPU-cheap; ambient `(1,1,1)` makes it visually transparent when no lights are active. Costs ~0.2 ms/frame even on integrated GPUs.
- Reusing forge/light means screen flash + hit glow share the same render path. No new shader, no `Graphics.tint` flash hack.
- The lighting accumulator is recomputed each tick from current `LightHandle` set; pure function of `(seed, t)` for flicker. **Replay determinism preserved** because all lights are added/removed in game-tick systems with deterministic seeds.

**Alternative considered, rejected:** PIXI `Graphics` overlay rect for screen flash. Works but bypasses forge/light's two-shader (WebGL + WebGPU) path and forces us to manage a second overlay container z-ordering for the hit-glow case. Cheaper to reuse.

### Q5. Walls — autotile sprites or coloured rect?

PLAN.md §4.3 says "no walls except the boundary." The wall-autotile system bestiary + dungeon-walk share is ~80 LOC of 47-entry Godot 3x3 lookup tables. For boundary-only walls, that's overkill.

**Decision: skip wall sprites entirely. Render a single dark-grey `Graphics` rect as the arena background; clamp player + chasers + projectiles to `[radius, design_w - radius] × [radius, design_h - radius]`. No `wall_c`, no `wall_index_r`, no `wall_autotile_system`.**

Visual contract: the boundary is shown by the player visibly stopping at the edge. The dummy in the centre is the only visible "obstacle". Walls are conceptual, not entity-shaped.

Saves ~150 LOC vs bestiary's wall pipeline. If `arena` later needs interior obstacles (it shouldn't, per PLAN.md), revisit.

### Q6. Tweening visual_pos_c

Bestiary uses `pos_c` (cell-snapped) + `visual_pos_c` (smoothed lerp) to hide discrete cell jumps. Arena uses continuous `pos_c` — no jump to hide.

**Decision: no `visual_pos_c`. Use forge's canonical `pos_c` directly for both logic and rendering.** Saves ~30 LOC; matches the continuous-motion decision in Q1.

`boot()` is called without `pos:` opt; forge defaults to `pos_c`. `sprite_sync_system` reads `pos_c` and updates Pixi sprite positions every `post`-stage tick.

---

## 3. File-level scope

Mirrors `subsystems/bestiary/` package shape exactly. Forge stays on `^0.4.2` for v0.0.1 of this subsystem; if the forge-side work in §4 lands in this same phase, bump the dep accordingly.

```
~/dev/echo/subsystems/arena/
├── package.json                    # @f0rbit/forge@^0.4.2 (bump to ^0.4.3 / ^0.5.0 if §4 ships)
├── tsconfig.json                   # extends echo root; alias @ar/*
├── index.html                      # mirror of bestiary/index.html
├── debug.html                      # debug fixture entry HTML
├── FRICTION.md                     # subsystem-specific friction log
├── PLAN.md                         # full subsystem plan (this file, polished)
├── public/                         # atlas assets — placeholder __default__ for v1
│   └── (no atlases needed for v1 — coloured-square __default__ frames suffice)
├── src/
│   ├── components.ts               # ~80 LOC — player_c, dummy_c, chaser_c, projectile_c,
│   │                               #          weapon_c, health_c, hitbox_c, vel_c, dir_vec_c,
│   │                               #          flash_c, swing_c, lifetime_c
│   ├── resources.ts                # ~50 LOC — arena_r, camera_shake_r, particles_r (ring buffer),
│   │                               #          hitstop_r, wave_r, run_seed_r, hit_events_r
│   ├── bindings.ts                 # ~25 LOC — WASD/arrow move + Z melee + X ranged + R restart + Tab debug
│   ├── grid.ts                     # ~5 LOC  — `g = grid({ cols: 20, rows: 11, tile: 16 })` for spatial debug only
│   ├── arena-gen.ts                # ~80 LOC — startup: spawn player, dummy, background rect, wave-1 chasers
│   ├── plugin.ts                   # ~100 LOC — game_plugin(world, schedule, opts)
│   ├── main.ts                     # ~80 LOC — boot wiring, lighting handle, surface_sprite shake hook
│   ├── main-debug.ts               # ~80 LOC — debug fixture entry (companion to main.ts)
│   ├── debug-plugin.ts             # ~80 LOC — stripped plugin for debug fixture
│   └── systems/
│       ├── input.ts                # ~30 LOC — reads move + just-pressed Z/X into dir_vec_c + weapon_c
│       ├── movement.ts             # ~40 LOC — continuous integration: pos_c += dir_vec_c * speed * dt;
│       │                           #          clamp to design canvas
│       ├── combat-melee.ts         # ~80 LOC — Z swing: spawn swing_c entity (arc), hit-detect chasers + dummy
│       ├── combat-ranged.ts        # ~80 LOC — X shot: spawn projectile_c entity; step; hit-detect;
│       │                           #          despawn on hit or boundary
│       ├── enemy-ai.ts             # ~70 LOC — chasers: normalize delta to player, advance at chaser_speed;
│       │                           #          contact-damage on overlap with player
│       ├── waves.ts                # ~80 LOC — when chasers_alive === 0: increment wave_r.current,
│       │                           #          spawn next wave's 5 chasers around perimeter; win at wave 4
│       ├── hitstop.ts              # ~30 LOC — read hit_events_r; if any, set time.scale = 0 +
│       │                           #          hitstop_r.remaining = 4. pre-stage decrements remaining,
│       │                           #          restores scale.
│       ├── camera-shake.ts         # ~60 LOC — on hit, push magnitude into camera_shake_r;
│       │                           #          render-stage system mutates surface_sprite.position
│       ├── flash.ts                # ~50 LOC — sprite-flash via sprite.set(w, id, { tint: 0xffffff })
│       │                           #          for flash_c.ttl ticks, then revert
│       ├── particles.ts            # ~120 LOC — ring buffer in particles_r; emit on hit; advance every tick;
│       │                           #          render to Graphics overlay (post-stage)
│       ├── light-fx.ts             # ~80 LOC — manage screen-flash LightHandle (melee) +
│       │                           #          per-impact hit-glow LightHandle (decay over 12 ticks)
│       ├── restart.ts              # ~40 LOC — R: world.clear(); regenerate; reset wave_r + health_r
│       └── sprite-attach.ts        # ~30 LOC — copy of bestiary pattern; attach sprites by component tag
├── replays/
│   └── wave-clear.replay.json      # seed 1, scripted input clearing all 3 waves
├── test/
│   ├── replay.test.ts              # ~150 LOC — replay determinism + world-hash invariant
│   ├── melee.test.ts               # ~80 LOC — arc-vs-circle hit detection unit tests
│   ├── ranged.test.ts              # ~80 LOC — projectile path + circle-vs-circle hit detection
│   ├── waves.test.ts               # ~80 LOC — wave transitions, spawn locations, win condition
│   ├── particles.test.ts           # ~60 LOC — ring buffer add/advance/drain semantics
│   ├── hitstop.test.ts             # ~50 LOC — time.scale = 0 for 4 ticks; resumes;
│   │                               #          periodic systems pause correctly
│   └── fixtures/
│       └── arena-scenario.ts       # deterministic test world builders
└── tools/
    └── record-wave-clear.ts        # ~80 LOC — record the canonical replay
```

### Forge-side (separate repo, separate version bump)

```
~/dev/forge/
├── src/
│   └── fx/                         # NEW subpath, only if §4 promotion lands this phase
│       ├── index.ts
│       └── particles.ts            # ring-buffer particle resource + system
└── package.json                    # bump exports + version
```

---

## 4. Forge stress points — what exists, what's new

### What already exists in forge v0.4.2 (no work needed)

| Surface | Path | Used by arena |
|---|---|---|
| `time.scale` (mutable, defaults 1) | `forge/src/time.ts` | Hitstop sets to 0 for 4 ticks. **No new forge work.** |
| `schedule.add(stage, sys, { every, phase, name })` | `forge/src/schedule.ts` | Wave-spawn cooldown, particle-emit throttle. |
| `world.spawn_many` / `despawn_marked` | `forge/src/world.ts` | Wave spawning, restart cleanup. |
| `world.clear()` | `forge/src/world.ts` | Restart. |
| `harness` (test rig) | `forge/src/harness.ts` | Replay test infrastructure. |
| `replay.record` / `replay.play` / `replay.load` / `replay_schema` | `forge/src/replay.ts` | Replay-as-test. |
| `pos_c` | `forge/src/index.ts` | Continuous-position storage. |
| `sprite_c` + `sprite_sync_system` + `sprite.set` | `forge/src/pixi/sprite.ts` | Sprite rendering, flash tint. |
| `@f0rbit/forge/light` (eye + handles + presets + flicker) | `forge/src/pixi/light/` | Hit glow + screen flash. |
| `event_to_world` / `coord_transform` | `forge/src/pixi/coords.ts` | Debug overlay mouse picking (debug fixture only — game uses Z/X keyboard). |
| `@f0rbit/forge/grid` `g.world_to_cell` | `forge/src/grid/` | Particle spatial debug, optional. |
| `palette` | `forge/src/palette/` | Game-side `/wave 3` / `/heal` commands for debug. |

### What does NOT exist in forge v0.4.2 (gap analysis)

#### Gap 1. Particle ring-buffer primitive (`forge.fx`)

PLAN.md predicted `forge.fx` as a v0.3.0 deliverable. Doesn't exist. Echo subsystems have no particle primitive to reuse — `bestiary` ships `telegraph-render` (per-event one-frame Graphics rect) which is shaped differently (per-entity, not pooled).

**Decision: ship the ring-buffer game-side first; defer forge promotion to Phase 6 (`boss`).** Rationale:
- One consumer (arena) is not enough to promote. PLAN.md §5 threshold is 2+.
- `boss` PLAN.md §4.6 lists "particles + camera shake (already in forge from 4.3) — heavy use" — that's the second consumer. Promote after `boss` proves the shape.
- Reduces this phase's scope from "arena + forge minor" to "arena alone".

**Game-side shape (this phase):**
```ts
// resources.ts
type ParticleEntry = {
  x: number; y: number;
  vx: number; vy: number;
  ttl: number;        // ticks remaining
  max_ttl: number;
  color: number;      // tint
  size: number;
};
type Particles = {
  entries: ParticleEntry[];   // ring-buffer; index `head` wraps
  head: number;
  capacity: number;           // 256 for v1
};
```
`particles.emit(p, x, y, count, opts)` writes `count` entries starting at `head`, wrapping. `particles.advance(p, dt)` decrements every TTL, advances `(x,y) += (vx,vy)`. `particles.render` reads all entries with `ttl > 0` and draws to a Graphics overlay each render tick.

**Forge promotion criteria for Phase 6:** if `boss` reuses the same shape (it will — projectile spirals, slam dust), promote `forge.fx.{ particles, emit, advance, render_system }` as a subpath.

#### Gap 2. Camera-shake / surface-sprite offset API

No `camera.set_offset(x, y)` exists. The shake offset has to mutate `surface_sprite.position` directly. Today, `surface_sprite` is private inside `make_render` (`forge/src/pixi/render.ts`) — `RenderState` does NOT expose it.

**Decision: forge patch to expose `surface_sprite` on `RenderState`, or add a `render.set_screen_offset(dx, dy)` setter.** This is the minimum viable forge change to enable arena camera shake without reaching into pixi internals from game code.

**Forge change (v0.4.3 patch, ship in Phase 3.0 sub-task A0):**
- Option (a) [recommended]: add `render.set_screen_offset(dx: number, dy: number): void` to `RenderState`. Internally it sets `surface_sprite.position.set(vp.offset.x + dx, vp.offset.y + dy)`. On `render.resize(w,h)`, the base offset updates; the screen-offset stays the same.
- Option (b) [rejected]: expose `surface_sprite` directly. Leaks an implementation detail; the next forge refactor can't change the two-stage RenderTexture pipeline without breaking arena.
- Option (c) [rejected, larger]: promote a full `camera.shake(magnitude, decay)` API. Too opinionated for a first cut; arena's shake math is 15 LOC and may diverge from boss's.

**Sizing:** ~25 LOC in `forge/src/pixi/render.ts` + 1 test. **Strictly additive — no breaking changes.** Patches as v0.4.3.

#### Gap 3. `time.scale_for(ticks, scale)` helper

Nice-to-have. Arena hitstop is 5 LOC game-side (set scale, store remaining, decrement in `pre`-stage system). **Decision: skip. Not promoting to forge.** If `boss` or `progress` re-implements it, promote then.

#### Summary of forge-side work in this phase

| Item | Scope | Version |
|---|---|---|
| `render.set_screen_offset(dx, dy)` | ~25 LOC in `pixi/render.ts` + RenderState type + 1 test | v0.4.3 patch |
| `forge.fx` (particles) | Deferred to Phase 6 (`boss`) | — |
| `time.scale_for` helper | Skipped (game-side suffices) | — |

Arena's `package.json` bumps from `@f0rbit/forge@^0.4.2` to `^0.4.3` once the patch lands. Dungeon-walk + bestiary stay on their current pins per PLAN.md §5 drift policy.

---

## 5. Phasing

Each phase ends with verification (typecheck + test + lint, no build/deploy verification per AGENTS.md skill) and an atomic commit. Within a phase, parallel tasks run in git worktrees via `coder-fast` agents; the verification coder merges and commits.

### Phase 3.0 — Forge patch (sequential, single coder)

**Worktree:** none. This work is in `~/dev/forge/`, not echo. Single `coder` agent (not `coder-fast`) because it touches a published API surface and needs review judgement.

| Task | LOC | Files |
|---|---|---|
| Add `RenderState.set_screen_offset(dx: number, dy: number): void` | ~25 | `forge/src/pixi/render.ts` (mutate `surface_sprite.position`); update `RenderState` type; ensure `apply_viewport` re-applies offset after resize |
| Add test `forge/test/pixi/render.test.ts::set_screen_offset` | ~30 | new test file or extend existing |
| Changeset entry + version bump | ~10 | `.changeset/*.md`, `package.json`, `CHANGELOG.md` |
| `bun run check:determinism` + `bun test` + `bun run build` green | 0 | (verification) |
| Publish `@f0rbit/forge@0.4.3` to npm | 0 | (the user does this; agent prepares the PR) |

**Deliverable.** `@f0rbit/forge@0.4.3` published. Arena can `bun add @f0rbit/forge@^0.4.3`.

**LOC total.** ~65 forge-side.

**Parallelisable.** No — single sequential task within forge.

**Gate before Phase 3.1.** Forge v0.4.3 published or user agrees to vendor it locally (e.g. `bun link`).

---

### Phase 3.1 — Subsystem scaffold (sequential, single coder)

**Worktree:** none. Single `coder` because scaffold is load-bearing and short.

| Task | LOC | Files |
|---|---|---|
| `subsystems/arena/package.json` + `tsconfig.json` + `index.html` + `debug.html` + `.gitignore` | ~80 | subsystems/arena/* |
| `src/components.ts` — all components from §3 | ~80 | subsystems/arena/src/components.ts |
| `src/resources.ts` — all resources from §3 | ~50 | subsystems/arena/src/resources.ts |
| `src/bindings.ts` — `merge_bindings(presets.movement_2d, { digital: { melee: [Z], ranged: [X], restart: [R], debug_toggle: [Tab] } })` | ~25 | subsystems/arena/src/bindings.ts |
| `src/grid.ts` — `g = grid({ cols: 20, rows: 11, tile: 16 })` | ~5 | subsystems/arena/src/grid.ts |
| `test/fixtures/arena-scenario.ts` — helpers for spawning a deterministic test world | ~60 | subsystems/arena/test/fixtures/arena-scenario.ts |
| Verify `bun --filter arena typecheck` passes (empty plugin OK at this stage) | 0 | (verification) |

**Deliverable.** Empty subsystem typechecks; folder structure exists.

**LOC total.** ~300.

**Verification commit:** `feat(arena): scaffold subsystem`.

---

### Phase 3.2 — Core combat + movement (parallel, 3 worktrees)

**Worktree A — movement + input.** Owns: `input.ts`, `movement.ts`. Continuous-motion player, vector dir from analog axes + Z/X edge-triggered fires.

**Worktree B — melee combat.** Owns: `combat-melee.ts`, `test/melee.test.ts`. Arc-vs-circle hit math; `swing_c` entity with `lifetime_c`; hit-event emission into `hit_events_r`.

**Worktree C — ranged combat.** Owns: `combat-ranged.ts`, `test/ranged.test.ts`. `projectile_c` entity; integration step; circle-vs-circle hit detection; boundary despawn.

| Worktree | Tasks | LOC |
|---|---|---|
| A | `src/systems/input.ts` + `src/systems/movement.ts` + `src/arena-gen.ts` (player spawn + background rect + dummy) | ~150 |
| B | `src/systems/combat-melee.ts` + `test/melee.test.ts` + add melee components to `components.ts` if missing | ~160 |
| C | `src/systems/combat-ranged.ts` + `test/ranged.test.ts` | ~160 |

**Coder-fast instruction (all 3):** "Do NOT run build/typecheck. Focus on the system code + unit tests in your worktree. Other agents touch overlapping files; the verifier merges."

**Dependencies between worktrees.** A's `arena-gen.ts` creates the player entity; B and C both query for that entity. They use the same component identifier (`player_c`), defined in Phase 3.1's `components.ts` (already merged before this phase starts). No runtime overlap; merge conflicts only possible on `components.ts` if a new component is needed. Each worktree adds components prefixed by its area (`arena.swing_c`, `arena.projectile_c`); the merge is trivial.

**Verification coder.**
- Merge A, B, C worktrees into the working branch.
- Wire `plugin.ts` to call input → movement → combat-melee → combat-ranged in `update` stage.
- Run `bun --filter arena typecheck` + `bun --filter arena test`. Fix integration issues.
- Atomic commit: `feat(arena): movement + melee + ranged combat`.

**LOC total.** ~470.

---

### Phase 3.3 — Enemies + waves (parallel, 2 worktrees)

**Worktree A — enemy AI.** Owns: `enemy-ai.ts`, `test/enemy-ai.test.ts`. Continuous-motion chasers; gradient toward player; contact damage on overlap.

**Worktree B — wave manager.** Owns: `waves.ts`, `test/waves.test.ts`, `restart.ts`, perimeter-spawn helpers in `arena-gen.ts`.

| Worktree | Tasks | LOC |
|---|---|---|
| A | `src/systems/enemy-ai.ts` (chaser AI: normalize delta, advance at speed, contact-damage event) + tests | ~150 |
| B | `src/systems/waves.ts` (wave-clear detection, next-wave spawn, win condition at wave 4) + `src/systems/restart.ts` (R key, world.clear, reset wave_r + health_r) + tests | ~160 |

**Verification coder.**
- Merge.
- Hook waves into `plugin.ts`; ensure restart resets all relevant resources.
- Run replay-less integration: spawn wave 1, simulate hits, confirm wave 2 spawns.
- Atomic commit: `feat(arena): enemy AI + wave manager + restart`.

**LOC total.** ~310.

---

### Phase 3.4 — Hit feedback (parallel, 4 worktrees) — THE CORE OF THIS SUBSYSTEM

**Worktree A — hitstop.** Owns: `hitstop.ts`, `test/hitstop.test.ts`. Reads `hit_events_r`; sets `time.scale = 0` + `hitstop_r.remaining_ticks = 4`; pre-stage system decrements + restores. Verify periodic systems pause correctly.

**Worktree B — camera shake.** Owns: `camera-shake.ts`. Reads hit events; magnitude push into `camera_shake_r`. Render-stage system calls `app.render.set_screen_offset(dx, dy)` with seeded-rng jitter; decay each render tick.

**Worktree C — sprite flash + screen flash.** Owns: `flash.ts`, `light-fx.ts`. Sprite-flash via `sprite.set(w, id, { tint })` for `flash_c.ttl` ticks. Melee swing triggers a full-screen flash via a one-frame LightHandle add → remove.

**Worktree D — particles.** Owns: `particles.ts`, `test/particles.test.ts`. Ring buffer (256 entries); emit on hit (12 particles per hit, randomised vx/vy from seeded rng); advance every tick; render via Graphics overlay added to `app.render.world`.

| Worktree | Tasks | LOC |
|---|---|---|
| A | `src/systems/hitstop.ts` + `test/hitstop.test.ts` | ~80 |
| B | `src/systems/camera-shake.ts` (uses `app.render.set_screen_offset` from forge 0.4.3) | ~60 |
| C | `src/systems/flash.ts` + `src/systems/light-fx.ts` | ~130 |
| D | `src/systems/particles.ts` + `test/particles.test.ts` | ~180 |

**Critical wiring (verifier responsibility):** all four systems read from `hit_events_r` (a `forge.anim_events_r`-shaped per-tick buffer cleared at `pre` stage). Worktree A defines the buffer + clear; B/C/D consume. Document this in `resources.ts`.

**Verification coder.**
- Merge.
- Wire `plugin.ts`: B + C + D registered in `post`; A's release-system in `pre`; A's trigger reads `hit_events_r` in `update` after combat systems.
- Update `main.ts` to install the Graphics overlay (particles) + the lighting filter on `app.render.world`.
- Run all unit tests; visual smoke is post-phase (debug fixture in Phase 3.6).
- Atomic commit: `feat(arena): hit feedback — hitstop, shake, flash, particles`.

**LOC total.** ~450.

---

### Phase 3.5 — Replay fixture + replay-as-test (sequential, single coder)

**Worktree:** none. `coder` (not `coder-fast`) because replay determinism is the load-bearing assertion and recording requires understanding the input timing.

| Task | LOC | Files |
|---|---|---|
| `tools/record-wave-clear.ts` — scripted input that clears all 3 waves at seed 1 | ~100 | subsystems/arena/tools/record-wave-clear.ts |
| `replays/wave-clear.replay.json` — generated by the tool | (data) | subsystems/arena/replays/wave-clear.replay.json |
| `test/replay.test.ts` — full replay-as-test deliverable (see §6 for assertions) | ~150 | subsystems/arena/test/replay.test.ts |
| Iterate on the scripted input until clear-all-3-waves is reliable across recordings | — | (iteration) |

**Deliverable.** `bun --filter arena test test/replay.test.ts` green. Replay is byte-stable across two consecutive runs (world-hash invariant).

**LOC total.** ~250.

**Verification commit:** `test(arena): replay-as-test fixture for wave clear`.

---

### Phase 3.6 — Debug fixture + visual verification (parallel, 2 worktrees)

**Worktree A — debug plugin + boot.** Owns: `main-debug.ts`, `debug-plugin.ts`. Stripped plugin: no waves, no enemy AI. A fixed punching bag, three pre-positioned target circles. Auto-fire melee every 60 ticks, ranged every 90 ticks. Maximum hitstop + shake + flash + particle density on a deterministic schedule.

**Worktree B — debug overlay.** Owns: a `debug-overlay.ts` system rendering on `app.render.debug_overlay` (unfiltered overlay container per AGENTS.md): per-tick HUD showing current `hitstop_r.remaining_ticks`, `camera_shake_r.magnitude`, particle count, wave state. Toggle via `Tab` key.

| Worktree | Tasks | LOC |
|---|---|---|
| A | `src/main-debug.ts` + `src/debug-plugin.ts` + build script entry (`bun build src/main-debug.ts --outdir dist/debug`) + `debug.html` wiring | ~150 |
| B | `src/systems/debug-overlay.ts` + integrate into `debug-plugin.ts` | ~120 |

**Verification coder.**
- Merge.
- Run `bun --filter arena build`; manually run the debug build locally (`bun --filter arena dev:debug` or similar — match bestiary/dungeon-walk shape).
- Atomic commit: `feat(arena): debug fixture for hit-feedback verification`.

**LOC total.** ~270.

---

### Phase 3.7 — Polish + AGENTS.md update (sequential, single coder)

| Task | LOC | Files |
|---|---|---|
| `FRICTION.md` — log friction discovered during arena dev | ~80 | subsystems/arena/FRICTION.md |
| `PLAN.md` — promote this `.plans/arena.md` into `subsystems/arena/PLAN.md` with status updated | ~varies | subsystems/arena/PLAN.md |
| Update root `README.md` to list arena | ~5 | README.md |
| Update root `AGENTS.md` if conventions emerged (see §8) | ~varies | AGENTS.md (PROPOSE, do not auto-write) |
| Final typecheck + lint + test sweep | 0 | (verification) |

**Verification commit:** `docs(arena): friction log + plan promotion`.

---

### Phase totals

| Phase | Echo LOC | Forge LOC | Parallel worktrees |
|---|---|---|---|
| 3.0 forge patch | — | ~65 | — (single coder) |
| 3.1 scaffold | ~300 | — | — |
| 3.2 combat | ~470 | — | 3 (A/B/C) |
| 3.3 enemies + waves | ~310 | — | 2 (A/B) |
| 3.4 hit feedback | ~450 | — | 4 (A/B/C/D) |
| 3.5 replay-as-test | ~250 | — | — |
| 3.6 debug fixture | ~270 | — | 2 (A/B) |
| 3.7 polish | ~85 | — | — |
| **Total** | **~2135** | **~65** | |

PLAN.md §7 Phase 3 budgeted ~810 echo-side LOC. We're at ~2.6× that. The overshoot is mostly tests + debug fixture (which PLAN.md didn't size) and the splitting of one combat task into melee + ranged + enemy-AI (which PLAN.md grouped). The "feel-good" core combat + feedback is still on budget. Flag for risk review (see §8).

---

## 6. Replay determinism strategy

### What `wave-clear.replay.json` records

Same shape as bestiary's `arena.replay.json`. ReplayDoc with:
- `seed: 1`
- `fixed_dt: 1 / 60`
- `frames: [...]` — tick-keyed action events (Z press, X press, axis updates)

### Assertions

```ts
describe("arena replay deliverable", () => {
  test("replay loads + validates schema", () => { /* schema check */ });

  test("at every kill tick, particles_r.entries has at least one ttl>0 entry", () => {
    // Drain mid-replay: pause at each tick where a chaser was just despawned,
    // assert particles.entries.find(e => e.ttl > 0) is non-null.
    // Implementation note: bestiary's replay test uses advance_to(tick); we do the same
    // but the assertion runs BEFORE the next tick advances (particles ring buffer
    // is consumed/decayed on tick; "at the kill tick" means immediately after the
    // kill-emitting system runs in update-stage).
  });

  test("wave_r.total_kills === 15 after replay completes", () => { /* */ });
  test("health_r.current > 0 after replay completes", () => { /* */ });
  test("wave_r.current === 4 (post-wave-3 win state) after replay completes", () => { /* */ });

  test("world hash at end of replay matches expected snapshot", () => {
    // sha256(JSON.stringify({
    //   player: pos_c snapshot,
    //   chasers_alive: count,
    //   wave: wave_r,
    //   health: health_r,
    //   total_kills: wave_r.total_kills,
    // })) === expected_hash
    // particles_r is NOT in the hash (render-only; non-deterministic across replay reruns
    // only because the recorder records actions, not particle state — particles re-emit
    // deterministically from the same rng-forked seeds).
  });

  test("two consecutive replay runs produce byte-identical world hashes", () => { /* */ });
});
```

### Hitstop in the harness

The harness drives `time.advance(fixed_dt, () => sch.tick(...))`. When the game system sets `time.scale = 0`, the harness's next `time.advance(fixed_dt)` consumes 0 ticks — exactly like the browser. `state.tick` does not advance until the 4-tick window passes (the `pre`-stage release system needs to run, which requires a tick to fire — so actually `time.scale = 0` blocks even the release system).

**Critical clarification.** With `scale = 0`, no tick consumed, no system runs at all. To make hitstop work in 4 ticks, the implementation must:

- **Trigger the release at a future wall-clock advance**, NOT via a periodic system.

**Implementation** (`hitstop.ts`):
```ts
// Trigger system (runs in update, after combat systems):
const trigger: System = (_w, ctx) => {
  const ev = ctx.res.get(hit_events_r);
  if (!ev.ok || ev.value.events.length === 0) return;
  const hs = ctx.res.get(hitstop_r);
  if (!hs.ok) return;
  if (hs.value.remaining > 0) return; // already in hitstop
  hs.value.remaining = 4;
  hs.value.release_at_real_t = ctx.time.elapsed + 4 * ctx.time.fixed_dt; // wall-clock target
  ctx.time.scale = 0;
};

// Release: this CANNOT be a schedule system (scale=0 blocks all ticks).
// Solution: a callback registered on the boot loop that runs every RAF
// (NOT every consumed tick). See "Forge gap 2 alternative" below.
```

**Forge gap 2 alternative — uncovered during planning.** Setting `scale = 0` blocks the entire schedule (including `render` and any release system). Three ways to handle:

- (a) **Use `scale = 0.001` instead of `0`.** Effectively frozen (1 tick consumed every 16 seconds at 60 Hz), but technically still advancing. `pre`-stage release system runs once after ~4 ticks of *real* wall clock. Replay determinism breaks: in headless tests, `time.advance(4 * fixed_dt)` with `scale = 0.001` consumes 0 ticks, replay sees no hitstop release; in browser the same `advance(...)` over real wall clock consumes 1 tick eventually. **Reject.**

- (b) **Track wall-clock elapsed in a render-stage system that runs every RAF** (outside `sch.tick`). Game code registers a `requestAnimationFrame` callback that polls `hitstop_r` and restores `time.scale = 1` when wall clock advances past `release_at_real_t`. Replay test substitutes a fake-RAF that advances real time deterministically. **Replay-fragile.**

- (c) **Forge change: split render stage out of `sch.tick`.** Render system runs every RAF regardless of `time.scale`. Hitstop pauses simulation; render keeps drawing (with `time.scale = 0`-aware systems showing the last sim-state frame). Release system also needs to run outside the scheduler — but the cleanest model is: when `time.scale = 0`, the render-stage callback STILL fires every RAF, and the release system is itself a render-stage system that reads wall-clock-elapsed (`time.elapsed_real`, a new field that always advances). **Largest forge change.**

- (d) **Game-side: decrement `hitstop_r.remaining_ticks` in the same tick the trigger fires; restore `scale = 1` when remaining hits 0.** I.e., hitstop is a *measurement* — at the end of the trigger tick, schedule the next 4 ticks to be skipped logically (game systems opt out via `if (hitstop_r.remaining > 0) return;`), but `time.scale` stays at 1. The render system continues to run; visually nothing changes for 4 ticks because the systems all early-exit. **Replay-stable, no forge change. Simulation ticks continue advancing (`time.tick` increments through hitstop), but the world state doesn't change because every game system gates on `hitstop_r.remaining === 0`.**

**Decision: (d).** Hitstop is a **game-state gate**, not a `time.scale` change. The 4-tick freeze is implemented as "every game system early-exits if `hitstop_r.remaining > 0`", with a `pre`-stage decrement.

This:
- **Preserves replay determinism perfectly.** `time.tick` advances normally; replay-recorded actions still fire on their tick; world hash matches across runs.
- **Visually freezes the screen** because sprite positions don't change, particles don't advance, etc. — `post`-stage `sprite_sync` writes the same `pos_c.x/y` for 4 frames running.
- **Camera shake and particles CAN still advance** during the freeze if we want — they're render-only and don't affect world hash. (Recommendation: pause particles too, so the freeze is total. Shake continues — it's the "punch" emphasis.)
- **No forge change needed for hitstop.** Drop forge gap 2 from §4. Forge patch v0.4.3 is only `render.set_screen_offset` for shake.

**Revised forge work (replaces §4 Gap 1+2 summary):**

| Item | Scope | Version |
|---|---|---|
| `render.set_screen_offset(dx, dy)` | ~25 LOC in `pixi/render.ts` + RenderState type + 1 test | v0.4.3 patch |
| `forge.fx` (particles) | Deferred to Phase 6 (`boss`) | — |
| `time.scale_for` / hitstop helper | NOT NEEDED — implemented as game-state gate | — |

### Particle replay-stability

`particles_r` is a ring buffer with bounded capacity (256). On hit, `particles.emit` writes deterministic entries seeded by `ctx.rng.float()` (forked from the global seed). Replay runs the same rng forks on the same ticks → byte-identical particle state. **The particle buffer IS replay-deterministic** even though it's "render-only" in spirit — because the rng is replay-deterministic. We can include particle counts in the world-hash if we want stronger guarantees.

Recommendation: include `particles_r.entries.filter(e => e.ttl > 0).length` in the world hash. Provides a strong "particles emitted as expected on each kill" assertion without baking individual particle positions into the hash (which would break under tiny numeric drift).

---

## 7. Migration / dependencies

### Echo workspace prerequisites (already in place)

- Root `package.json` lists `subsystems/*` in workspaces (verified).
- Per-subsystem `package.json` shape established by bestiary (verified).
- `.github/workflows/pages.yml` aggregates `subsystems/<name>/dist` (verified).

### New deps for arena

- `@f0rbit/forge@^0.4.3` (after forge patch lands; falls back to `^0.4.2` if forge work slips).
- `@f0rbit/corpus@^0.3.5` (matches bestiary).
- `pixi.js@^8` (matches bestiary).
- `zod@^3.25.0` (matches bestiary, for replay schema).

### Subsystem version drift

Per PLAN.md §5, drift is allowed until Phase 8. After this phase:
- `dungeon-walk`: still `@f0rbit/forge@^0.4.2` (or whatever was current at its last touch).
- `bestiary`: `@f0rbit/forge@^0.4.2`.
- `arena`: `@f0rbit/forge@^0.4.3` (post-patch).

No coordinated bump required. Phase 8 absorbs the alignment.

### Forge → echo flow

Forge work in Phase 3.0 happens in `~/dev/forge/`. After v0.4.3 is published to npm, arena's `package.json` is updated and `bun install` from echo root resolves the new version. **No `bun link` / workspace-symlink shortcut** — per PLAN.md §3 + AGENTS.md, subsystems consume forge from npm, never via symlink.

### BREAKING changes

None. Forge change is **purely additive** (`RenderState` gains one method; no existing surface modified). Existing dungeon-walk + bestiary continue to work on `^0.4.2` and could opt in to `^0.4.3` at zero migration cost.

---

## 8. Open questions (resolved)

### OQ-A1. Punching-bag dummy — health or invincible?

**Resolved: invincible.** Dummy soaks hits forever, displays flash + spawns particles, never despawns. It exists for free-form feedback testing without wave pressure. Health bar over its head displays "∞" or stays absent.

### OQ-A2. Player health UI

**Resolved: simple HUD via debug_overlay container.** Three filled red squares in the top-left, one removed per hit. Loss state when third is removed; show "GAME OVER" text + auto-restart prompt. No need to ship a real UI primitive (loot subsystem will need one; held until then per PLAN.md §4.4 rationale).

### OQ-A3. Wave-spawn locations

**Resolved: perimeter spawn at 5 points equidistant around the arena edge.** Deterministic per-wave; not seeded — same 5 spawn points for waves 1, 2, 3 (mechanically simpler; the "feel" doesn't change with spawn variation since chasers swarm anyway).

### OQ-A4. Chaser speed scaling per wave

**Resolved: wave 1 = 1.5 tile/sec, wave 2 = 2.0 tile/sec, wave 3 = 2.5 tile/sec.** Light scaling makes wave 3 visibly harder without breaking the replay (replay records the seed; speed is deterministic from wave number).

### OQ-A5. Projectile pierce vs single-target

**Resolved: single-target.** Projectile despawns on first hit. Pierce is a `loot` upgrade story.

### OQ-A6. Melee swing area shape — wedge or sector?

**Resolved: 90° sector in front of `dir_vec_c`, reach = 1.5 tiles.** Calculated as: for each chaser within `reach`, check `dot(normalize(chaser.pos - player.pos), player.dir_vec) > cos(45°)`. Pure math, no Pixi.

### OQ-A7. Should arena's chaser AI reuse bestiary's `chaser_think_system`?

**Resolved: no.** Bestiary's chaser does A* over a wall grid (~150 LOC); arena has no walls. Arena's chaser is "normalize delta, advance" (~20 LOC). Copying bestiary's would add ~130 LOC of dead-code paths. **This is a deliberate game-side divergence**; PLAN.md §5 says "copy game-side until 2+ subsystems need the same shape" — arena's continuous chaser doesn't match bestiary's discrete chaser.

### OQ-A8. Lighting filter on `app.render.world` — required for screen flash?

**Resolved: yes (per Q4 above).** Ambient `(1, 1, 1)` makes it visually invisible until a light fires. Cost ~0.2 ms/frame; acceptable.

### OQ-A9. PLAN.md §7 Phase 3 LOC overshoot

**Resolved: accept the overshoot, document the cause.** PLAN.md sized 810 LOC echo-side; this plan estimates ~2135 echo-side. Causes:
- PLAN.md didn't count tests (~520 LOC of test files here).
- PLAN.md didn't count debug fixture (~270 LOC).
- PLAN.md collapsed "combat" into 200 LOC; we split into melee + ranged + enemy-AI = ~470 LOC.

Without tests + debug fixture, echo-side is ~1345 LOC, still over 810 budget by 1.66×. This is consistent with PLAN.md §9 R1 ("scope creep per demo") — call it out at the user-review step and accept it OR trim systems C (light-fx is the cheapest cut: ~80 LOC; loses screen-flash juice — recommend keeping).

**Recommendation: keep all features as planned. Update PLAN.md §7 to reflect the realistic budget once arena ships.**

### OQ-A10. Should the verifier coder also push the forge change to npm?

**Resolved: no.** Forge publishing is `OIDC` via `publish.yml` triggered by tag push. The Phase 3.0 verification coder prepares the PR + changeset; the user merges + tags + releases. Arena work waits on the tag.

---

## 9. Risks

### R1 — Hitstop "game-state gate" approach unfamiliar

Most engines model hitstop as `time.scale = 0`. This plan models it as `if (hitstop_r.remaining > 0) return;` in every game system. The replay-determinism win is large, but the pattern needs to be applied consistently — one system that forgets the gate will visibly move during the freeze.

**Mitigation:** factor the gate into a helper. `const should_skip = (ctx) => hitstop_active(ctx); systems do early return.` Document in arena `FRICTION.md` and surface to AGENTS.md if `boss` and `progress` need the same shape.

### R2 — Lighting filter latent cost at scale

Bestiary uses lighting with ~10 LightHandles. Arena will peak at maybe 20–30 (5 chasers × ~3 simultaneous hit-glows + 1 screen flash). The GPU accumulator is O(N) per pixel; at 30 lights × 320×180 = 1.7 M ops/frame. Should be fine but flag for perf check during debug fixture.

**Mitigation:** debug overlay shows lighting frame-time. Cap concurrent LightHandles at 32; recycle oldest if exceeded.

### R3 — Replay-stability of `surface_sprite.position` shake

Shake is render-only and seeded by tick; world hash never sees it. **No replay risk.** The risk is visual flicker if `set_screen_offset` is called with an offset > integer scale (`6× scale → 6 px subpixel jitter looks distinct from 1 px`). 

**Mitigation:** clamp shake magnitude to `[0, 4]` in design pixels. At 6× integer scale, that's at most 24 device pixels of jitter — visible without being seizure-inducing.

### R4 — Particle ring buffer overflow under sustained hit pressure

Capacity 256. Wave 3 has 5 chasers; if the player melees through a clump, all 5 die in 1–2 ticks → 60 particles emitted. Then projectile hits another → 12 more. Steady-state fills 256 in ~4 hits. Beyond that, oldest entries get overwritten — fine for v1 (the particles are short-lived anyway, ~30 ticks TTL) but flag for the verifier.

**Mitigation:** debug overlay shows particle-buffer fill %. If it pins at 100%, bump capacity.

### R5 — Forge v0.4.3 publish delay

Phase 3.0 depends on forge publishing the patch to npm. If the user can't publish quickly, arena work blocks at Phase 3.4 (camera shake needs the new API).

**Mitigation:** if publish is delayed, vendor forge into arena's `package.json` via `"@f0rbit/forge": "file:../../../forge"` for development; replace with `^0.4.3` once published. AGENTS.md warns against workspace-symlink — this is a temporary dev workaround, not a long-term arrangement.

---

## 10. Phase task summary (for devpad mirror)

devpad MCP tools are not available in this session. The user should mirror these tasks into devpad manually, or the next session with devpad access can run `devpad_tasks_upsert` against the structure below. Each row maps cleanly to one devpad task with `tag: "arena"` and `project: echo`.

| Phase | Sub-task | Worktree | Owner agent | Depends on |
|---|---|---|---|---|
| 3.0 | forge patch: `render.set_screen_offset` | — | coder (forge repo) | — |
| 3.0 | forge patch: tests + changeset + publish | — | coder (forge repo) | 3.0 patch impl |
| 3.1 | arena scaffold (`package.json`, components, resources, bindings) | — | coder | 3.0 published |
| 3.2-A | continuous movement + input | A | coder-fast | 3.1 |
| 3.2-B | melee combat + tests | B | coder-fast | 3.1 |
| 3.2-C | ranged combat + tests | C | coder-fast | 3.1 |
| 3.2-V | merge + wire plugin + atomic commit | — | coder (verify) | 3.2 A/B/C |
| 3.3-A | enemy AI (continuous chaser) | A | coder-fast | 3.2-V |
| 3.3-B | wave manager + restart | B | coder-fast | 3.2-V |
| 3.3-V | merge + wire + commit | — | coder (verify) | 3.3 A/B |
| 3.4-A | hitstop (game-state gate) + tests | A | coder-fast | 3.3-V |
| 3.4-B | camera shake (uses forge 0.4.3) | B | coder-fast | 3.3-V |
| 3.4-C | sprite flash + light-fx screen flash | C | coder-fast | 3.3-V |
| 3.4-D | particles ring buffer + tests | D | coder-fast | 3.3-V |
| 3.4-V | merge + wire + commit | — | coder (verify) | 3.4 A/B/C/D |
| 3.5 | replay-as-test fixture + tool | — | coder | 3.4-V |
| 3.6-A | debug fixture entry + plugin | A | coder-fast | 3.5 |
| 3.6-B | debug overlay HUD | B | coder-fast | 3.5 |
| 3.6-V | merge + build + commit | — | coder (verify) | 3.6 A/B |
| 3.7 | FRICTION.md + PLAN.md promotion + AGENTS.md proposal | — | coder | 3.6-V |

**Task counts:** 5 sequential single-coder tasks, 11 parallel `coder-fast` tasks across 4 phases of parallel work, 4 verification coder tasks (one per parallel phase).

---

## 11. Suggested AGENTS.md updates

Propose these for `~/dev/echo/AGENTS.md` after arena ships, pending user approval. **Never write to AGENTS.md without confirmation.**

- **Hitstop is a game-state gate, not a `time.scale` change.** Adding `time.scale = 0` blocks the entire schedule (including `render`). Use a `hitstop_r.remaining_ticks` resource that each gameplay system early-exits on. Render-stage systems (particles, shake, sprite_sync) still run, so the screen visibly freezes via "no game state changed" rather than "no draw call issued". This preserves replay determinism unconditionally.
- **Continuous-motion subsystems do not need `visual_pos_c`.** Bestiary + dungeon-walk use `pos_c` (cell-snapped) + `visual_pos_c` (lerped) + `tween_step_system` to hide cell jumps. Arena uses `pos_c` continuously, so the tween layer is omitted. Future subsystems pick one model — don't mix.
- **Camera shake mutates `surface_sprite.position` via `render.set_screen_offset(dx, dy)`** (forge ≥ 0.4.3). Game code reaches it through `app.render.set_screen_offset`. Never mutate `app.stage.position` (shakes the HUD) or `app.render.world.position` (shifts world inside the RenderTexture, wrong granularity).
- **Lighting filter with `ambient = (1, 1, 1)` is the right primitive for cosmetic flashes** even when the game has no FOV. Reuses `@f0rbit/forge/light` instead of one-off Graphics overlays.
- **Particle ring buffer is a candidate for forge promotion after `boss`.** Arena's `src/systems/particles.ts` ships game-side per the 2-consumer rule; once `boss` reuses the shape, promote as `@f0rbit/forge/fx`.

---

## 12. Reference paths

| Topic | Path |
|---|---|
| Subsystem package shape (canonical) | `~/dev/echo/subsystems/bestiary/package.json` |
| Subsystem plugin pattern | `~/dev/echo/subsystems/bestiary/src/plugin.ts` |
| Replay-as-test pattern | `~/dev/echo/subsystems/bestiary/test/replay.test.ts` |
| Recording tool pattern | `~/dev/echo/subsystems/bestiary/tools/record-arena.ts` |
| Debug fixture pattern | `~/dev/echo/subsystems/dungeon-walk/src/main-debug.ts` + `debug-plugin.ts` |
| Forge boot wiring (`time.advance` + sch.tick callback) | `~/dev/forge/src/pixi/index.ts:226-235` |
| Forge time.scale mechanics | `~/dev/forge/src/time.ts:28-43` |
| Forge two-stage render pipeline | `~/dev/forge/src/pixi/render.ts:80-100` |
| Lighting subpath | `~/dev/forge/src/pixi/light/index.ts` |
| Lighting consumer example | `~/dev/echo/subsystems/bestiary/src/main.ts:40-90` |
| Rendering conventions (non-negotiable) | `~/dev/echo/AGENTS.md` (section "Rendering conventions") |
