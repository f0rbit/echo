# Architecture & simulation patterns

> **Read this in full before writing or modifying any gameplay system** (movement, AI, combat, XP, pause/FSM logic, anything registered on the schedule). Every section below documents a bug that actually shipped and was fixed — skipping this file means re-shipping the bug.

## Quick checklist

Before you write a system, confirm:

- [ ] You know which **movement model** this subsystem uses (cell-step vs continuous — never mix).
- [ ] Movement reads the **live input vector**, never `dir_c`.
- [ ] Pauses/freezes use a **gate resource**, never `time.scale = 0`.
- [ ] Systems that consume `hit_events_r` on the emit tick do **NOT** gate on hitstop.
- [ ] Transient state (click queues, pending flags) lives in **factory closures**, not resources.
- [ ] Copied files (chaser AI, `fsm.ts`, UI helpers) carry a `// FORGE-PROMOTION-CANDIDATE` header and the paused-gate.
- [ ] Every update-stage gameplay system early-returns when the game-state FSM says `state !== "playing"` (if the subsystem has a shell).

## System stage placement (quick reference)

| Stage | What lives here | Examples |
|-------|-----------------|----------|
| `pre` | Gate releases, FSM transitions, occupancy indexes, deferred startup | `game-state.ts` (phase 0), `hitstop.ts` release, `creature-occupancy.ts` |
| `update` | Gameplay logic (gated by pause/FSM resources) | movement, AI, combat, XP |
| `post` | Reactive bookkeeping | `sprite-attach.ts`, `auto-save.ts` |
| `render` | Visual-only decay/apply (keeps running through freezes — intentional) | camera shake apply, flash decay, HUD |

`creature_occupancy_system` runs in `pre`, not `update` — occupancy must be fresh BEFORE `ai-chaser` queries it (progress FRICTION.md §12).

## Continuous motion vs. cell-step

Cell-step subsystems (`bestiary`, `dungeon-walk`, `loot`, `progress`) integrate via `g.move_tile` and use `pos_c` (snapped) + `visual_pos_c` (lerped) + `tween_step_system` to hide the cell jumps. Continuous-motion subsystems (`arena`) integrate `vel_c { vx, vy }` into `pos_c` directly each tick — there is no `visual_pos_c` and the tween system is omitted. `dir_vec_c` is repurposed as **facing persistence**: only updated on non-zero input, so a stationary player still has a heading for melee/ranged direction.

Do not mix the two models in one subsystem. Pick one at scaffold time. See `subsystems/arena/src/systems/movement.ts` and arena FRICTION.md §8.

### `dir_c` write convention diverges by ability shape

Within cell-step subsystems there are two `dir_c` patterns — pick at scaffold time based on whether the subsystem ships a directional ability:

- **Loot pattern** (no melee, no ranged): write `{dx, dy}` every tick — `{0, 0}` when no input. `dir_c` is just last-input.
- **Progress pattern** (cell-step + directional ability — melee / ranged / facing-driven swing arc): write `dir_c` **only on nonzero input**. A stationary player retains their last heading so the `Z` swing / arrow shot has a direction.

**Critical: `dir_c` is for ABILITY DIRECTION, NOT MOVEMENT.** Cell-step movement must read the **live input vector** via `ctx.input.vector("move.x", "move.y")` and step only when the axis is nonzero. If `movement_system` reads `dir_c` under the Progress pattern, releasing all WASD/arrow keys leaves the last heading written — so the player keeps cell-stepping in that direction every `step_every` ticks forever (the "slides forever after one keypress" bug). Always:

```ts
// movement.ts — read LIVE input, not dir_c
const [ax, ay] = ctx.input.vector("move.x", "move.y");
const dx = sign(ax);
const dy = sign(ay);
if (dx === 0 && dy === 0) return;  // axis released → no step
g.move_tile(w, id, { dx, dy }, { blocked_by });

// input.ts — facing-only writes to dir_c (Progress pattern)
if (dx === 0 && dy === 0) continue;  // preserve last heading
w.set(id, dir_c, { dx, dy });
```

Document the choice in the subsystem's local notes. See progress FRICTION.md §4 + `subsystems/progress/src/systems/movement.ts`.

## Game-state gates, NOT `time.scale = 0`

Do NOT model frame-pauses (hitstop, level-up pause, dialogue freeze) as `ctx.time.scale = 0`. `time.advance(real_dt, each)` increments the accumulator by `real_dt * scale`; with `scale = 0` the accumulator never fills, `sch.tick` never fires, and the `pre`-stage release system that's supposed to restore `scale = 1` never runs. Permanent freeze.

Correct pattern: a gate resource (e.g. `hitstop_r.remaining > 0`, `paused_r.value`) → every gameplay system early-returns. A `pre`-stage release decrements/clears the gate; that release system must NOT gate on itself. `time.scale` stays at `1`. Render-stage systems keep ticking (shake + flash + light-fx continue to decay through the freeze — intentional). Replay determinism is preserved because `time.tick` advances normally. See `subsystems/arena/src/systems/hitstop.ts` and arena FRICTION.md §1 (commit `52ba5b6`).

## Hit-event consumers and hitstop gating

`hit_events_r` is cleared in the **next** tick's `pre` stage. `hitstop_trigger` (update stage, after combat) sets `hitstop_r.remaining = 4` on the **same** tick the hit landed. Any system that reads `hit_events_r` later in that same update stage and gates on hitstop will skip on the trigger tick — and by the time hitstop releases 4 ticks later, the events have been cleared. **Emit-side work (particles, light-fx hit-glows, screen flash) must NOT gate on hitstop. Only `advance`/`decay`-style work gates.**

See `subsystems/arena/src/systems/particles.ts` and arena FRICTION.md §2 (commit `c984dd9`).

## Real-time melee + sacrifice-on-contact enemies need a swing-active window, NOT edge-triggered hits

Edge-triggered melee (`ctx.input.just("swing")` → kill adjacent) works only when the player's input phase and the enemy contact phase reliably align in the same tick. In real-time subsystems where chasers sacrifice-on-contact (despawn + damage as soon as they reach chebyshev-1), the player-perceived window for a Z press is essentially 0 — every chaser dies to contact before any edge-trigger can land. Z feels broken even though the code is "correct".

Correct pattern: Z press queues `swing_state_r.active_until_tick = current_tick + WINDOW` (~15 ticks ≈ 250ms — a swing arc duration). Melee-swing system fires every tick while the window is open, killing any adjacent chaser. After the window expires, no effect until next Z press. Contact-damage's sacrifice behaviour stays — the window is short enough that spam-killing isn't possible. `swing_state_r` IS in the snapshot (replay determinism). See `subsystems/progress/src/systems/melee-swing.ts` + progress FRICTION.md §24 (commit `1b2acd0`). Current progress melee uses chebyshev-adjacency, not `dir_c` — but the `dir_c` facing convention still applies if a future subsystem ships a directional ranged ability.

## Transient state in factory closures, not resources

Anything in the resource bag is contracted into the snapshot surface. Click queues, animation pending-flags, network in-flight requests, DOM event buffers — anything that must NOT survive snapshot/restore — belongs in a factory closure, not a resource.

Pattern: `make_<system>(): { system: System; <imperative_setter>(): void }`. The returned system is registered; the imperative setters are called by DOM handlers / replay bridges / etc. The closure-captured state never enters the snapshot surface. Loot's inventory click queue is the canonical example: `make_inventory_system(): { system, queue_click }`. See `subsystems/loot/src/systems/inventory.ts` and loot FRICTION.md §4.

Exception: RNG streams must NOT be closure-captured either — see `docs/persistence-replay.md` "Closure-held rng forks".

Related divergence that earned its keep: `auto-save.ts` (progress) keeps closure-local `prev_chaser_count` + `prev_level` and diff-checks in `post` stage, instead of plumbing `mark_dirty_for_save` flags through every save-triggering system. One file instead of four. See progress FRICTION.md §15.

## Game shell — resource-driven FSM with copied bestiary `fsm.ts`

Subsystems that ship landing / win / lost screens use a `game_state_r` resource keyed by `"menu" | "playing" | "won" | "lost"`. Every update-stage gameplay system early-returns when `state !== "playing"`. Render-stage systems keep running so overlays (menu, win banner, lost banner) continue to display + animate at full `time.scale = 1`.

Transitions live in a single `game-state.ts` system at `pre` phase 0 — it inspects health, wave state, and input actions, calls a tiny FSM helper (`fsm.ts`, ~12 LOC, copied byte-identical from bestiary's), and on the transition into `playing` re-runs `setup_arena` (idempotent).

Boot flow: `main.ts` wires the three overlay screens as siblings of `surface_sprite` via `addChildAt(palette_idx)` (per `docs/rendering.md` "Sibling z-order"), mirrors viewport scale + offset on resize, and does **NOT** call `setup_arena` at boot — the FSM owns the spawn step.

Gate via resource early-return, never via `time.scale`. The menu screen runs at full `time.scale = 1` so overlay animations are smooth.

Canonical implementation: `subsystems/arena/` (Phase 5.9.4). Apply to other subsystems only after a third consumer materialises — until then, `fsm.ts` stays a copied-not-shared 12-LOC helper (bestiary AI + arena shell are the two current consumers, and their state shapes differ).

### Restart sweep when changing startup spawn timing

If a system depends on entities spawned at startup, and startup gets deferred to a `pre`-stage system (e.g. game-state FSM owning `setup_arena` instead of running it at boot), the dependent system **must also move to pre-stage** — and it must be idempotent (because `pre` runs every tick while spawn only happens once per FSM transition).

Symptom if you forget: the dependent system runs once at `update` on tick 0 against an empty world, then never re-checks. State (e.g. wave timer, spawn point reservation) is silently broken for the rest of the run.

Pattern: any system that reads entities-spawned-by-the-startup-flow gets a fast bail-out (`if (already_initialized) return`) and moves to pre-stage alongside the FSM. Bit phase 5.9.4 (arena shell).

### Input-driven systems need state gates when adding a game-state FSM

Adding a `game_state_r` FSM to a previously-stateless subsystem requires a sweep across **every input-driven system** — not just gameplay ones. Examples:

- Restart action (R) — should reset to `menu`, not just respawn
- Pause toggle (Esc) — should be gated on `state === "playing"`
- Debug toggles (Tab, etc.) — usually fine to leave ungated, but think it through

The first FSM-conversion of a subsystem is the only time this matters; after that, future additions just follow the existing pattern. Bit phase 5.9.4 (arena shell) — restart action was firing during `menu` state, causing instant-respawn-on-menu-press-R.

## No `@echo/shared` — duplication over a sidecar package

Subsystems never import from each other or from a shared sibling package. Duplication is the signal that something belongs in forge — not in a sidecar package. See `PLAN.md` §5 for the forge promotion criteria and `docs/forge.md` for the live promotion-candidates tracker.

### Convention for duplicating bestiary's chaser AI

When copying bestiary's cell-step chaser AI (`astar.ts`, `systems/ai-chaser.ts`, `systems/path-step.ts`, `systems/creature-occupancy.ts`) to a new subsystem:

- **Add the `<sub>_r.paused` early-return gate** at the top of each copied system. Bestiary doesn't pause; downstream subsystems do. Forget the gate and chasers chase through the level-up pause.
- **Annotate every copied file with a `// FORGE-PROMOTION-CANDIDATE` header** listing all known consumers and the planned promotion phase (currently Phase 8 `main`). Promotion-candidate density on a file is the signal future agents look for.
- **Component-shape divergences** (e.g. `state_c { kind, aggro_radius }` in bestiary vs. `state_c { kind }` in progress) resolve via **module constants** in the consumer — not by widening the shared shape. Only the third consumer forces a generalised shape; until then, copies diverge locally. (Progress uses `AGGRO_RADIUS = 8` as a module constant in `ai-chaser.ts` — progress FRICTION.md §2.)
- **If you edit a copied file, sync the change back to the source subsystem or surface the divergence** — silent drift between copies erodes the Phase 8 promotion case (progress FRICTION.md §1).

Three copies exist as of progress (bestiary, progress; boss-to-come is the fourth consumer signal).
