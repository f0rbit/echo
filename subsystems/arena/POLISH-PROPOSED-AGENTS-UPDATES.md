# Proposed AGENTS.md updates — Polish pass (Phase 5.9.0 – 5.9.5)

These are conventions that emerged across the polish pass spanning `arena`,
`loot`, `progress`, `bestiary`, and `dungeon-walk` (forge promotion + visual
parity + game shell + crisp text). Each block is shaped to paste into
`~/dev/echo/AGENTS.md` at the indicated section. Review one-by-one and either
merge into AGENTS.md or discard — **nothing here has been written to
AGENTS.md yet**.

Citations point to `.plans/polish-pass.md` §8 and the relevant commits.

---

## 1. Crisp text recipe — `resolution: 4` + conditional `scale.set(0.5)`

**Target section:** "Rendering conventions".

> ### Crisp text — `resolution: 4` per-Text, `scale: 0.5` when container scales
>
> All `pixi.Text` constructors get `resolution: 4`. The follow-up
> `text.scale.set(0.5)` depends on the parent container:
>
> | Parent | `resolution` | `text.scale.set(...)` |
> |--------|--------------|------------------------|
> | `app.render.world` (lighting-filtered) | 4 | 0.5 |
> | `app.render.debug_overlay` (canvas-pixel space) | 4 | — (no scale) |
> | `app.stage` modal mirroring `surface_sprite` (loot inventory, progress perks, arena shell screens) | 4 | 0.5 |
>
> The 4× super-sample renders the glyph cache at higher DPI; the 0.5 scale
> takes the displayed Text back to design-space dimensions. **Net effective
> on-screen DPI: 2× the design canvas.** Without this, Pixi v8 samples the
> cached glyph texture inappropriately when the container scales > 1 — text
> looks aliased + blurry.
>
> Practical consequence for modal text (any place `scale.set(0.5)` is in
> play): **double the stored `fontSize` and `wordWrapWidth`** so the visible
> size + wrap behaviour match the original design. E.g. a design-space 8 px
> label with `wordWrapWidth: 78` becomes `fontSize: 16` + `wordWrapWidth: 156`
> after the recipe; on-screen result is 8 px visible at 4× DPI cache.
>
> Established by commit `f1614a6` (bestiary wall-debug) for `app.render.world`;
> extended to `app.stage` modal overlays by arena shell screens (Phase 5.9.4);
> swept across loot HUDs + progress HUDs + arena debug overlay in Phase 5.9.5.

---

## 2. Game shell — state-machine over resource gate (not `time.scale = 0`)

**Target section:** "Architecture patterns", just below "Game-state gates,
NOT `time.scale = 0`".

> ### Game shell — resource-driven FSM with copied bestiary `fsm.ts`
>
> Subsystems that ship landing / win / lost screens use a `game_state_r`
> resource keyed by `"menu" | "playing" | "won" | "lost"`. Every update-stage
> gameplay system early-returns when `state !== "playing"`. Render-stage
> systems keep running so overlays (menu, win banner, lost banner) continue
> to display + animate at full `time.scale = 1`.
>
> Transitions live in a single `game-state.ts` system at `pre` phase 0 — it
> inspects health, wave state, and input actions, calls a tiny FSM helper
> (`fsm.ts`, ~12 LOC, copied byte-identical from bestiary's), and on the
> transition into `playing` re-runs `setup_arena` (idempotent).
>
> Boot flow: `main.ts` wires the three overlay screens as siblings of
> `surface_sprite` via `addChildAt(palette_idx)` (per the "Sibling z-order in
> `app.stage`" recipe), mirrors viewport scale + offset on resize, and does
> **NOT** call `setup_arena` at boot — the FSM owns the spawn step.
>
> Per "Game-state gates, NOT `time.scale = 0`" above — gate via resource
> early-return, never via `time.scale`. The menu screen runs at full
> `time.scale = 1` so overlay animations are smooth.
>
> Canonical implementation: `subsystems/arena/` (Phase 5.9.4). Apply to other
> subsystems only after a third consumer materialises — until then, `fsm.ts`
> stays a copied-not-shared 12-LOC helper (bestiary AI + arena shell are the
> two current consumers, and their state shapes differ).

---

## 3. Tiled floors + perimeter walls — apply uniformly

**Target section:** "Rendering conventions" (or a new "Visual baseline"
section right above it).

> ### Tiled floors + perimeter walls — every subsystem
>
> All subsystems with a 20×11 single-room arena render:
> - A `floor_c` entity in **every** cell (sprite `floor_1`, z=1).
> - A `wall_c` entity in every **perimeter** cell (sprite via
>   `wall_autotile_system` from `@f0rbit/forge/autotile`, z=2).
>
> Game entities (player, enemies, projectiles, pickups) sit at z=3. The 0x72
> floor frames have full opaque coverage; the 0x72 wall frames have
> transparent edges (designed to show floor through them) — hence
> floor + wall **co-spawn at the same perimeter cell**, with explicit z-order
> resolving stacking.
>
> Spawn reservations (player spawn, pickup placement, enemy spawn) MUST
> exclude wall cells. Visual walls are **NOT collision-blocking** — existing
> `g.in_bounds` clamping (arena) or cell-step move guards (loot, progress)
> prevent the player from leaving the playable area. arena `PLAN.md` §4.3
> ("no walls except boundary") is updated to reflect this visual convention.
>
> Per "No `@echo/shared`" above — `walls-autotile.{png,json}` is **duplicated
> per subsystem** under `public/`. Forge ships no binaries; duplication is
> the cost of the per-subsystem-asset rule.
>
> Established as standard in Phase 5.9.0–5.9.3 of the polish pass.

---

## 4. Update "Forge promotion candidates" — autotile shipped in v0.5.0

**Target section:** "Forge promotion candidates (deferred)".

> Remove the `wall-autotile` row entirely — it's no longer deferred.
> `@f0rbit/forge/autotile` shipped in **v0.5.0** (Phase 5.9.0) and is now
> consumed by bestiary, dungeon-walk, arena, loot, and progress (5 consumers).
>
> Remaining deferred candidates after Phase 5.9.0:
> - `localstorage_store()` — 1 consumer (progress), promote at Phase 7 hub.
> - `compose_modifiers()` — 2 consumers (loot, progress), waiting on main (Phase 8) as the third.
> - A* + chaser AI bundle — 2 consumers (bestiary, progress), boss (Phase 6) is the third → promote at end of Phase 8.

---

## 5. Visual smoke port hygiene — `bunx serve` silently reuses stale ports

**Target section:** A new "Debug fixture pattern" sibling, or under
"Build / test / deploy".

> ### `bunx serve` silently uses stale ports — verify with `curl` before screenshotting
>
> `bunx serve` (or `python -m http.server`) bound to an already-occupied port
> will silently fall through to **the previous process** serving that port —
> Chrome DevTools then screenshots stale content, which the agent reads as
> "the change didn't apply".
>
> Before trusting a visual screenshot, verify the live response:
>
> ```sh
> curl -s http://localhost:<port>/ | head -5
> ```
>
> Confirm the response matches the current `dist/index.html`. If it doesn't,
> kill stale processes (`lsof -i :<port>` → `kill -9 <pid>`) and re-serve.
>
> Bit phase 5.9.3 (progress visual smoke). Cost: ~30 min of false-positive
> debugging. Trivially preventable.

---

## 6. Replay re-record needed when changing rng-consuming setup

**Target section:** "Snapshot / persistence", near the closure-held rng note.

> ### Re-record replay fixtures when changing rng-consuming setup
>
> Adding or reordering any rng-consuming step in startup or pre-stage breaks
> existing recorded replays. Examples that require a fresh recording + new
> expected hash:
>
> - Pickup placement order or count
> - Enemy spawn slot reservation (changes the draw count before player spawn)
> - Perk choice shuffle (changes which 3 of N perks appear at LV-up)
> - Anything calling `ctx.rng.fork()` or `ctx.rng.next_*()` at startup
>
> Even visually-identical changes (e.g. spawning a wall + floor entity
> alongside the player) do NOT require re-record IF those entities don't
> enter the world-hash projection AND they don't consume from `ctx.rng`.
> arena Phase 5.9.1 (walls + floors, no game-state shell) needed NO re-record
> because the projection is `{ player_pos, wave_state, health, particles }`
> and floor/wall spawn doesn't roll dice. arena Phase 5.9.4 (game shell with
> deferred `setup_arena`) **did** need re-record because the rng-draw
> sequence shifted by one tick.
>
> Workflow: record at `f0rbit.github.io/echo/<sub>/` via the in-page recorder
> → save the JSON → update `expected_hash` in `test/replay.test.ts` → confirm
> replay-as-test passes.
>
> Bit phase 5.9.2 (loot) when re-checking, no-op for that subsystem; bit
> phase 5.9.4 (arena shell) as expected — replay fixture re-recorded with
> the new `start_game` tick-2 input.

---

## 7. `make_eye_follow_system` is position-component generic

**Target section:** "Forge API gotchas" (positive finding, not a gotcha).

> ### `make_eye_follow_system` accepts any `Component<{x, y}>` position
>
> Forge's `make_eye_follow_system` (eye / pupil tracking on cell-step + on
> continuous-motion subsystems) is generic over the position component
> shape — it accepts any `Component<{x, y}>`. Confirmed working for:
>
> - `pos_c` (continuous-motion: arena) — integer-snapped per tick
> - `visual_pos_c` (cell-step + tween: loot, progress, bestiary) — lerped per tick
>
> Future subsystems don't need to worry about the position-component shape
> matching — just pass whichever one the player's eyes should track.
>
> Surfaced in Phase 5.9.1 (arena visual parity, copying the recipe to
> continuous-motion).

---

## 8. Stage-move dependent systems when startup spawn moves to pre-stage

**Target section:** "Architecture patterns", near the game-state-gate note.

> ### Restart sweep when changing startup spawn timing
>
> If a system depends on entities spawned at startup, and startup gets
> deferred to a `pre`-stage system (e.g. game-state FSM owning `setup_arena`
> instead of running it at boot), the dependent system **must also move to
> pre-stage** — and it must be idempotent (because `pre` runs every tick
> while spawn only happens once per FSM transition).
>
> Symptom if you forget: the dependent system runs once at `update` on tick
> 0 against an empty world, then never re-checks. State (e.g. wave timer,
> spawn point reservation) is silently broken for the rest of the run.
>
> Pattern: any system that reads entities-spawned-by-the-startup-flow gets
> a fast bail-out (`if (already_initialized) return`) and moves to pre-stage
> alongside the FSM.
>
> Bit phase 5.9.4 (arena shell). Cost: ~20 min of "why is the wave counter
> zero" debugging.

---

## 9. Restart sweep when adding a game-state FSM to a stateless subsystem

**Target section:** "Architecture patterns", near the game-state-gate note.

> ### Input-driven systems need state gates when adding a game-state FSM
>
> Adding a `game_state_r` FSM to a previously-stateless subsystem requires
> a sweep across **every input-driven system** — not just gameplay ones.
> Examples:
>
> - Restart action (R) — should reset to `menu`, not just respawn
> - Pause toggle (Esc) — should be gated on `state === "playing"`
> - Debug toggles (Tab, etc.) — usually fine to leave ungated, but think it through
>
> The first FSM-conversion of a subsystem is the only time this matters;
> after that, future additions just follow the existing pattern.
>
> Bit phase 5.9.4 (arena shell). Restart action was firing during `menu`
> state, causing instant-respawn-on-menu-press-R. Fix was a one-line gate
> in `restart.ts`.

---

## Summary

9 candidate AGENTS.md additions captured. None merged yet — review with the
user and integrate one-by-one (each is shaped as a paste-ready block with a
target section). Cross-references to `.plans/polish-pass.md` §8 inline.
