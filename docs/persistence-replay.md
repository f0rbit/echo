# Persistence, snapshots, replay & testing

> **Read this in full before touching** the snapshot surface, disk saves, RNG, replay fixtures, `bindings.ts`, or any `test/` file. This is the subsystem area with the most invisible failure modes — bugs here pass locally and diverge ticks later.

## Quick checklist

- [ ] Only **dynamic** state goes in the snapshot. Static config (registries, lookup tables) rehydrates via startup. Transient UI state lives in closures (see `docs/architecture.md`).
- [ ] No closure-held `ctx.rng.fork()` streams — re-fork per tick with a tick-suffixed label.
- [ ] World-hash projections go through `canonical_stringify`.
- [ ] Restore targets run their boot tick BEFORE `snapper.restore(...)`.
- [ ] Any change to rng-consuming setup ⇒ **re-record the replay fixture** and update `expected_hash`.
- [ ] UI clicks that must be replayable go through synthetic action bindings, not raw DOM events.
- [ ] Replay tests pass an explicit timeout (default 5 s will abort them).

## The snapshot surface — what goes in

| State | In snapshot? | Where it lives |
|-------|--------------|----------------|
| Gameplay resources (health, wave, XP, `swing_state_r`) | YES | resource bag, registered with snapshotter |
| Entities + components | YES | world |
| Static config (item registries, behaviour tables, sprite-frame maps) | NO — rehydrated by the startup system | resource bag, NOT registered. Comment the declaration: `// NOT snapshotted — static config, rehydrated by setup_<sub>` |
| Transient state (click queues, pending flags, DOM buffers) | NO — must not survive restore | factory closures (`make_<system>(): { system, queue_click }`) |
| RNG fork streams | NO — see below | re-fork per tick, never closure-captured |

Loot's `item_registry_r` is the canonical static-config example (loot FRICTION.md §3). `snapshot_schema` is re-exported from `@f0rbit/forge` root — there is no `@f0rbit/forge/snapshot` subpath (progress FRICTION.md §8).

## Snapshot world-hash needs canonical-stringify

Zod's `safeParse(value).data` normalises object key order to schema declaration order, NOT the construction order of the input. If your world-hash projection builds objects in one order and the post-restore copy is rebuilt from snapshot-parsed values, `JSON.stringify` produces byte-different strings for byte-identical state.

Fix: either build the projection with canonical (sorted) key order, OR wrap the projection in a `canonical_stringify` that sorts keys at every depth before stringifying. Loot uses the latter; see `subsystems/loot/test/replay.test.ts:canonical_stringify` and loot FRICTION.md §1.

## `Snapshotter.restore()` is destructive — boot the target first

`restore(w, snap, ...)` calls `w.clear()` as the first step before re-creating entities from the snapshot. **If the restore target hasn't run its boot tick yet, the next `update`-stage tick will fire the startup gate (e.g. `setup_arena`) and clobber the restored entities silently** — no error, just wrong state on the following tick.

Pattern: a `make_restore_target()` helper runs the boot tick first (which sets the `startup_done` resource flag and rehydrates any startup-only state), THEN passes the harness to `snapper.restore`. See `subsystems/loot/test/replay.test.ts:make_restore_target` and loot FRICTION.md §2. The pattern transferred verbatim into progress (progress FRICTION.md §9).

This composes with the static-config rule: the restore target's boot tick rehydrates the static config; restore re-populates the dynamic state on top.

## Closure-held `ctx.rng.fork()` streams are NOT in the snapshot

`Snapshotter` captures `ctx.rng` state only. Streams produced by `ctx.rng.fork()` and held in factory closures (e.g. a spawn-RNG, a perk-shuffle RNG) **do not survive restore.** Post-restore, a re-fork from the restored `ctx.rng` state starts from the same draw count, but the original closure has advanced past that fork by N draws — so the new fork's stream is offset.

**Canonical fix — re-fork per tick with a tick-suffixed label:**

```ts
// enemy-spawn.ts — no closure state, immune to snapshot drift
const r = ctx.rng.fork(`progress.spawn.${ctx.time.tick}`);
```

The tick-suffixed label gives every spawn-eligible tick a distinct deterministic stream, so the draw at tick N is identical across replays and across pre/post-restore continuations. Costs one extra hash per use (negligible) and removes an entire class of replay-determinism bugs. Applied in progress `enemy-spawn.ts` (progress FRICTION.md §5 + §25).

Fallback (rare): snapshot the forked stream state explicitly on a resource that IS in the snapshot surface. Larger surface area; only if per-tick re-fork is genuinely too expensive.

**Symptom if you ignore this:** mid-replay snap-and-restore appears byte-stable for one tick, then diverges several ticks later as the next fork-draw happens at different counts in source vs. restored sim.

## Re-record replay fixtures when changing rng-consuming setup

Adding or reordering any rng-consuming step in startup or pre-stage breaks existing recorded replays. Examples that require a fresh recording + new expected hash:

- Pickup placement order or count
- Enemy spawn slot reservation (changes the draw count before player spawn)
- Perk choice shuffle (changes which 3 of N perks appear at LV-up)
- Anything calling `ctx.rng.fork()` or `ctx.rng.next_*()` at startup

Even visually-identical changes (e.g. spawning a wall + floor entity alongside the player) do NOT require re-record IF those entities don't enter the world-hash projection AND they don't consume from `ctx.rng`. arena Phase 5.9.1 (walls + floors, no game-state shell) needed NO re-record because the projection is `{ player_pos, wave_state, health, particles }` and floor/wall spawn doesn't roll dice. arena Phase 5.9.4 (game shell with deferred `setup_arena`) **did** need re-record because the rng-draw sequence shifted by one tick.

**Workflow:** record at `f0rbit.github.io/echo/<sub>/` (or the locally served build) via the in-page recorder → save the JSON to `replays/` → update `expected_hash` in `test/replay.test.ts` → confirm replay-as-test passes.

Recorder iteration count is a real cost (arena took 5 attempts, progress 3, loot 1) — choreograph inputs against cell-step timing carefully, and pick any mid-replay `snap_tick` between fork-draws, not before one (progress FRICTION.md §10).

## Disk-save key shared between production and debug fixture is intentional

Progress's debug fixture writes to `echo:progress:save:slot-1` — the same key as the production page. Intentional: running the debug fixture then reloading the production page surfaces the restored state visually, with zero manual input needed.

Consequence: debug fixture is destructive to any prior production save in the same browser profile. **Surface this in the subsystem's FRICTION.md** so a user who plays a real run then runs the debug fixture knows their save was overwritten. See progress FRICTION.md §13.

## Synthetic action bindings for replay-recordable UI clicks

DOM `pointerdown` does NOT flow through forge's bindings layer, so it is not in the replay stream. To make UI clicks replay-deterministic, wire each UI action as a digital action binding on a reserved key (e.g. `slot_click_0..11` bound to `F1..F12`). Real users never press these. The recorder emits them when the DOM handler fires; the replay-player consumes them via a tiny bridge system that calls the same imperative setter (e.g. `queue_click`) as the real DOM handler.

This avoids extending the replay schema. **Do not "simplify" this into recording mouse coords directly** — that breaks replay determinism. Leave a comment in `bindings.ts` explaining why `F1..F12` exist. See `subsystems/loot/src/bindings.ts` + `subsystems/loot/src/systems/synthetic-slot-click.ts` and loot FRICTION.md §7. Progress does the same for perk picks (`synthetic-perk-pick.ts`).

## Test harness quirks

### `harness.tick()` only runs the `update` stage

The bun test harness's `tick()` method runs only the `update` stage — `startup`, `pre`, `post`, and `render` are skipped. Tests that need world state pre-seeded must set resources + spawn entities directly (e.g. `ctx.res.set(item_registry_r, make_test_registry())`) rather than relying on `startup`-stage systems to do it. This bites every time a new subsystem writes its first test fixture. Document the seed helpers in `test/fixtures/<sub>-scenario.ts`. See `subsystems/loot/test/fixtures/loot-scenario.ts` and loot FRICTION.md §11.

### Replay-as-test timeouts

`bun test` defaults to a 5 s per-test timeout. Replay-driven tests run the full recorded fixture (e.g. arena's `wave-clear.replay.json` is 2812 frames ≈ 30 s of fixed-dt simulation in the harness), which trips the default with a useless abort. Pass the timeout as the third arg to `test()`:

```ts
const REPLAY_TIMEOUT_MS = 30000;
test("wave_r.total_kills === 15", () => { /* ... */ }, REPLAY_TIMEOUT_MS);
```

See `subsystems/arena/test/replay.test.ts` and arena FRICTION.md §7.
