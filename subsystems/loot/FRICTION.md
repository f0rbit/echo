# loot — friction notes

## Status

Loot subsystem complete (v0.0.1 against forge 0.4.3). Cell-step player in a 320×180 single-room arena; walk-over pickup; 12-slot inventory grid + 4-slot equipment (weapon / offhand / ring1 / ring2); additive + multiplicative stat composition; snapshot mid-replay round-trip is byte-stable; debug fixture page. Live at https://f0rbit.github.io/echo/loot/ + /loot/debug/. 53 tests across 5 files.

Friction hit while building this subsystem — terse, ordered by impact for the next agent (likely `progress`, Phase 5). Not a postmortem.

## 1. Zod schema-driven key reordering breaks naive `JSON.stringify` equality

Zod's `safeParse(value).data` returns objects whose **own-enumerable key order matches schema declaration order**, not the construction order of the input. Snapshotter walks schemas in declaration order. A world-hash projection built `{ player_pos, pickups, inventory, ... }` while the equivalent post-restore projection (rebuilt from snapshot-parsed values) walked keys in schema order. JSON.stringify outputs key-order-sensitively → byte-different hashes for byte-identical state.

**Fix:** the projection is wrapped in a `canonical_stringify` (sort keys at every depth before stringifying). See `test/replay.test.ts`. Hit during Phase 4.5 replay byte-stability assertion. Any future snapshotted subsystem with a world-hash projection needs the same canonicalisation step.

## 2. `Snapshotter.restore()` destructively `world.clear()`s before re-spawn

`restore(w, snap, ...)` calls `w.clear()` as the first step. The follow-up logic re-creates entities from the snapshot. So if your restore target hasn't run its boot tick yet, `arena_gen_system` (which gates on `arena_r.startup_done`) **fires on the next `update` tick after restore, clobbers the restored entities with a fresh world, and the round-trip fails silently** (no error; just wrong state).

**Pattern.** A `make_restore_target()` helper runs the boot tick (which sets `arena_r.startup_done = true` and rehydrates `item_registry_r`), THEN passes the harness to `snapper.restore`. Phase 4.5 test fixture. Surface this in the AGENTS.md proposals (§2).

## 3. `item_registry_r` is intentionally NOT snapshotted

Static config (the ItemDef lookup table) rehydrates via `setup_arena` on every boot. The snapshot surface lists `arena_r`, `run_seed_r`, `inventory_ui_r` but explicitly omits `item_registry_r`. **Restore-into-clean-world only works if the target world also calls `setup_arena` first** (see §2). Comment on the resource declaration: `// NOT snapshotted — static config, rehydrated by setup_arena`. Fragile invariant; future agents will trip on it.

## 4. Transient state lives in factory closures, not resources

Plan §2 Q5 sketched `inventory_ui_r.pending_click_idx` as a one-tick transient resource field. **Shipped shape: closure-local FIFO.** `make_inventory_system(): { system, queue_click }` returns both the registered system and an imperative setter. Both the DOM `pointerdown` handler and the replay-stable `synthetic_slot_click_system` call `queue_click(idx)`. The system drains the closure queue each tick.

Why closure, not resource: anything in the resource bag is contracted into the snapshot surface. A `pending_click_idx` that survives snapshot would replay clicks that already fired on restore. Closure state never enters the snapshot surface. Same logic applies to: animation pending-flags, network in-flight requests, DOM event queues. See `src/systems/inventory.ts`.

## 5. Inventory UI overlay needs viewport-mirror callback on resize

`inventory_ui_container` is installed on `app.app.stage` as a sibling of `surface_sprite`. Forge's render pipeline applies scale + offset to `surface_sprite` (the offscreen-composited design canvas), but **NOT to other `app.stage` children**. The overlay container has to manually mirror `surface_sprite.scale.x` and `surface_sprite.position.{x,y}`.

Apply the mirror **once at boot** AND **on every `app.render.resize()` callback** (forge fires a resize event when the window changes). Not every tick — wasted work for state that only changes on resize. See `main.ts:120` for the viewport-mirror wiring. Hit during Phase 4.4 when the overlay rendered at a fraction of the expected size after first resize.

## 6. `app.app.stage` vs `app.stage` + deterministic sibling z-order

Forge's `app` object exposes both `app.stage` (a re-export convenience) and `app.app.stage` (the underlying Pixi `Application.stage`). To insert a sibling deterministically between forge's built-in children (`surface_sprite`, `debug_overlay`, `palette_overlay`), use `app.app.stage.getChildIndex(palette_overlay)` to find the slot, then `app.app.stage.addChildAt(inventory_ui_container, idx)`. Plain `addChild` always appends at the top — wrong if you want the modal below the palette overlay. See `main.ts:120`.

## 7. Synthetic action bindings as the replay-stable click channel

DOM `pointerdown` does not flow through the forge bindings layer, so it's not in the replay stream. To make UI clicks replay-deterministic, we add 12 digital action bindings (`slot_click_0..11`) wired to reserved keys (`F1..F12`). Real users never press them. The recorder emits them when the DOM handler fires. The replay-player consumes them via a tiny `synthetic_slot_click_system` that calls `queue_click(idx)` (same target as the real DOM handler).

This avoids extending the replay schema. The trade-off: anyone reading `bindings.ts` cold sees `F1..F12` mapped to slot clicks with no obvious explanation; FRICTION docs it. See `src/bindings.ts` and `src/systems/synthetic-slot-click.ts`. Phase 4.5.

## 8. `item_registry_r` resource type left as `Map<string, unknown>`

Phase 4.0 declared the resource loose to avoid an import cycle between `resources.ts` and `data/items.ts`. Tightening to `Map<string, ItemDef>` requires touches across `stats.ts`, `inventory.ts`, `main.ts`, `arena-gen.ts`, `inventory-ui.ts` plus test fixtures. The working pragma is to cast at consumption points (`stats.ts:49`, `main.ts:86`).

Acceptable; flagged in the Deviations section of PLAN.md. Future cleanup: move `ItemDef` type into `resources.ts` itself, or split `data/items.ts` into `data/item-types.ts` (types only) + `data/items.ts` (data using those types).

## 9. `schedule.add(stage, sys, { every, phase })` semantics

A system registered as `{ every: 10, phase: 1 }` fires when `tick % 10 === 1` — that's ticks 1, 11, 21, …, not 10, 20, 30. Plus-one off-by-one was the test-tick arithmetic that drove Phase 4.3 test fixtures: `step_every = 10`, `phase = 1` means after `harness.tick(11)` the movement system has fired twice (ticks 1 and 11). Watch this when scripting cell-step replays.

## 10. `Id` is opaque

`Id` is declared as `{ readonly __id: unique symbol }` (not a number alias). Test helpers that previously accepted `number` for entity ids no longer compile; the harness exposes `Id` directly. Fixture builders in `test/fixtures/loot-scenario.ts` return `Id`, not raw numbers; consumers thread it through. Trivial once you see the type error; non-trivial when you don't and the test still typechecks because TS narrows `any`.

## 11. `harness.tick()` only runs `update` stage

Tests pre-seed resources + entities directly (e.g. `ctx.res.set(item_registry_r, make_test_registry())` plus `world.spawn(...)`) rather than relying on `startup`-stage systems to do it. This is consistent with bestiary + arena; loot just hit it more often because more systems wanted the registry. Phase 4.2 unit tests sidestep `arena-gen` entirely.

## 12. Recorder iterations: loot needed 1 (vs arena's 5)

Arena's `record-wave-clear.ts` took 5 iterations to produce a deterministic replay: tweaking step counts, projectile timing, AI pursuit gating. Loot's `record-equip-and-stat.ts` worked first try.

Why: cell-step + no enemies is trivially scriptable. Arena's continuous motion + enemy AI compounds — a 1-tick AI behaviour shift cascades into different damage-tick ordering. Loot's actions are discrete state changes (step, pickup, click) with no rebound.

Counter-lesson for `progress` (Phase 5): if it reuses arena's combat, expect arena's recording-iteration count. If it stays cell-step + no enemies (perk-choice + XP-bar), expect loot's.

## 13. Stat HUD positioning at startup races the first render

`stat-panel-hud.ts` writes the Text component's position. **The first render tick may fire before the viewport callback has run** (which provides the canvas pixel dimensions). Position the HUD components in a `render`-stage system (which runs each frame), not at construction time. The `dirty_stats` flag controls TEXT updates; the position update is unconditional each render. ~60 LOC. Phase 4.4.

## 14. AGENTS.md "Forge API gotchas" still bit during sanity checks

The codified conventions (`world.spawn` variadic, `world.despawn` not `delete`, `ctx.res` not `world.res`, marker components elided from query tuples) are right — and they still bit during Phase 4.3 plugin-wiring sanity checks. Reading the section before each new file is friction-free; trusting recall isn't. Reinforces the value of pinning these in AGENTS.md.

## 15. `make_inventory_system` factory + closures pattern survived snapshot tests

Worth calling out positively: the closure-state-per-factory pattern (see §4) survived snapshot round-trip without modification. The snapshotter doesn't see the closure-captured `click_queue` (because it's not in the resource bag); restore replays cleanly from a fresh closure. The pattern is the right abstraction for any "transient state per system" need — promote to AGENTS.md.
