# arena — friction notes

## Status

Arena subsystem complete (v0.0.1 against forge 0.4.3). Player + dummy + 3 waves of chasers, full hit-feedback stack (hitstop, camera shake, sprite flash, screen-flash light, particles), replay-deterministic wave clear, debug fixture page. Live at https://f0rbit.github.io/echo/arena/ + /arena/debug/.

Friction hit while building this subsystem — terse, ordered by impact for the next agent. Not a postmortem.

## 1. Hitstop via `time.scale = 0` deadlocks the schedule

Plan §2 Q2's original answer was "set `ctx.time.scale = 0` for 4 ticks, pre-stage system restores." Wrong. `time.advance(real_dt, each)` increments the accumulator by `real_dt * scale`. With `scale = 0`, accumulator never fills → `sch.tick` never fires → the release system that's supposed to restore `scale = 1` never runs. Permanent freeze. Hit this in browser the first time we tried it.

**Fix:** hitstop is a **game-state gate**. `hitstop_r.remaining > 0` → every gameplay system early-returns. `pre`-stage release decrements `remaining`. `time.scale` is never mutated. Render-stage systems keep ticking (so shake + flash decay through the freeze, fine). Replay determinism preserved unconditionally because `time.tick` advances normally. Plan §2 Q2 was rewritten after the fact (commit `52ba5b6`).

## 2. Particles emit gated on hitstop loses the trigger-tick events

`hit_events_r` is cleared in `pre` of the **next** tick. `hitstop_trigger` (update phase 7) sets `remaining = 4` on the same tick the hit landed. If `particles_emit` (update phase 9) gates on hitstop too, it skips on the trigger tick → events are gone next pre → particles never emit at all.

**Rule:** any system reading `hit_events_r` **after** `hitstop_trigger` in the same tick must NOT gate on hitstop. Only `advance`/`decay`-style work gates. Discovered while writing the "particles emit on every kill tick" replay assertion (commit `c984dd9`).

## 3. `wave_r.current` never reaches `total + 1`

Plan §6 said the win assertion was `wave_r.current === 4` (after wave 3). Reality: `waves.ts` only increments `current` when spawning the next wave; on the final wave-clear there's no next spawn. Correct invariant is `wave_r.current === wave_r.total === 3 && wave_r.chasers_alive === 0`. Plan corrected in this phase.

## 4. `wave_r.total_kills` was missing from the scaffold

Plan §6 referenced `wave_r.total_kills === 15`. Phase 3.1 scaffold's `Wave` shape was `{ current, total, chasers_alive }` — no `total_kills`. Surfaced mid-Phase 3.5 when writing the replay-as-test. Added then; incremented in `waves.ts` reaper on `health <= 0` death (not contact-damage, which despawns directly). Lesson: **scaffold from the assertions backwards**, not from the resource list forwards.

## 5. `health_r` does not exist

Plan §6 and §3 referenced a `health_r` resource. There is no such thing — health is a `health_c` component on the player entity. Plan corrected. Future plans should default to "health = component on player" unless multi-target health pools are explicitly needed.

## 6. Worktree base-ref unreliable for short-cycle parallel work

Phase 3.2's Worktree C was based on a pre-scaffold commit despite `worktree.baseRef = head` in `.claude/settings.local.json`; the coder's files showed up dangling in the host tree. Used sequential coders for the remaining parallel phases (3.3, 3.4, 3.6) instead. Net result was still fast — phases were already small enough that coordination > parallelism.

## 7. Bun's default test timeout is 5 s — replay tests need more

`replays/wave-clear.replay.json` is 2812 frames (~30 s at fixed_dt = 1/60). Default `bun test` timeout aborts mid-replay with no useful error. Pass `30000` as the third arg to `test()` or set `REPLAY_TIMEOUT_MS = 30000` and thread it through every replay-driven test.

## 8. Continuous-motion diverges from bestiary + dungeon-walk

Cell-step subsystems integrate via `g.move_tile` and use `pos_c` (snapped) + `visual_pos_c` (lerped) + `tween_step_system` to hide cell jumps. Arena skips all of that:

- `vel_c { vx, vy }` is integrated into `pos_c` every tick by `movement.ts`.
- `visual_pos_c` is unused; `pos_c` is the rendered position.
- `dir_vec_c` is repurposed as **facing persistence** — only updated when input is non-zero (so a stationary player still has a heading for melee/ranged direction).

Mixing the two models in one subsystem would be a mess. Pick one and commit.

## 9. `debug.html` script src must reference `./main.js`, not `./main-debug.js`

The arena build script (mirroring dungeon-walk's) post-renames `dist/debug/main-debug.js → dist/debug/main.js`. The scaffold's `debug.html` shipped with `<script src="./main-debug.js">` — wrong by default; the live page 404s on the script. Verifier caught it in Phase 3.6.

## 10. Lighting filter is fine for cosmetic-only use — just configure ambient + eye correctly

Arena has no FOV. Wanted screen-flash + hit-glow through forge's existing `make_light_system` rather than a one-off Graphics overlay. Trick: `ambient: [1, 1, 1]` (full bright) + an eye-light at the player with `radius_cells: max(cols, rows) * 2` and `intensity: 1, falloff: 0.01`. Filter becomes visually transparent until FX lights are added on top. ~0.2 ms/frame cost, two-shader path is reused, no new overlay management.

## 11. Recording a 3-wave clear took 5 strategies

Naive "spin in place" died to chaser swarms. "Walk a square" died to corner traps. Pure flee died because the player never fired. Aim-at-nearest-target died because the recorder couldn't see distances clearly. The shipping recorder (Phase 3.5) is hybrid: rotate facing through 8 directions on a 32-tick cycle (so every angle gets hit), override with a flee axis when the nearest chaser is inside `DANGER_RADIUS = 16 px`. Player fires constantly on the cooldown. Clears wave 3 at tick 2812 with full HP at seed 1.

**Replay still byte-stable** because the recorder reads `pos_c` from a deterministic sim and emits actions as a pure function of (seed, tick). Two consecutive recordings produce byte-identical JSON.

## 12. Camera shake lives on `surface_sprite.position`, not `world` or `stage`

`app.render.world` has identity transform (the design→window scale lives on `surface_sprite`, child of `app.stage`). Shaking `world.position` shifts content **inside** the offscreen RenderTexture at design resolution (1 px = 1 design-px = huge at 6× scale). Shaking `app.stage` shakes the HUD and palette UI too. Correct surface is `app.render.set_screen_offset(dx, dy)` (forge 0.4.3+) which writes through to `surface_sprite.position` in window coords — 1 px shake = 1 device pixel.

## 13. Parallel coders cannot share file ownership safely without worktrees

Phase 3.2 had 3 coder-fast worktrees touching overlapping files (`components.ts`, `arena-gen.ts`, `plugin.ts`). The verifier merge handled it but reconciliation was non-trivial — see `e224d7d`'s commit body. Future parallel phases either need stricter file partitioning at plan time OR fall back to sequential single-coder for small phases.

---

## Forge promotion candidates surfaced

| # | Candidate | Strength | Notes |
|---|---|---|---|
| 1 | Particle ring buffer | Medium | One consumer (arena); promote after `boss` adds the second per PLAN.md §5 |
| 2 | Hitstop-gate helper | Low | 5 LOC game-side; revisit if `boss`/`progress` re-implement |
| 3 | `time.scale_for` | Drop | Game-state gate is the right shape; `time.scale` mutation is the trap |
