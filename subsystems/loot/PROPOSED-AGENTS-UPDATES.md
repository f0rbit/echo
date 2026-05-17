# Proposed AGENTS.md updates — loot Phase 4.0–4.7

These are conventions that emerged while building `subsystems/loot/`. Each block is shaped to paste into `~/dev/echo/AGENTS.md` at the indicated section. Review one-by-one and either merge into AGENTS.md or discard — **nothing here has been written to AGENTS.md yet**.

Citations point to FRICTION.md (this subsystem) and the relevant commits in `b235c96..5f6f63d` + this docs commit.

---

## 1. Snapshot world-hash projections need canonical-stringify

**Target section:** new subsection under "Forge API gotchas" (or a new "Snapshot" subsection).

> ### Snapshot world-hash needs canonical-stringify
>
> Zod's `safeParse(value).data` normalises object key order to schema declaration order, NOT the construction order of the input. If your world-hash projection builds objects in one order and the post-restore copy is rebuilt from snapshot-parsed values, JSON.stringify will produce byte-different strings for byte-identical state.
>
> Fix: either build the projection with canonical (sorted) key order, OR wrap the projection in a `canonical_stringify` that sorts keys at every depth before stringifying. Loot uses the latter; see `subsystems/loot/test/replay.test.ts:canonical_stringify` for the pattern.
>
> See FRICTION.md §1 (Phase 4.5).

---

## 2. `Snapshotter.restore()` destructively clears the world

**Target section:** "Forge API gotchas" or alongside the snapshot note above.

> ### Snapshotter.restore() is destructive — boot the target first
>
> `restore(w, snap, ...)` calls `w.clear()` as the first step before re-creating entities from the snapshot. **If the restore target hasn't run its boot tick yet, the next `update`-stage tick will fire the startup gate (e.g. `setup_arena`) and clobber the restored entities silently** — no error, just wrong state on the following tick.
>
> Pattern: a `make_restore_target()` helper runs the boot tick first (which sets the `startup_done` resource flag and rehydrates any startup-only state), THEN passes the harness to `snapper.restore`. See `subsystems/loot/test/replay.test.ts:make_restore_target` and FRICTION.md §2.

---

## 3. Static config NOT in snapshot — rehydrate via startup

**Target section:** "Forge API gotchas" or alongside the snapshot notes.

> ### Static config does NOT go in the snapshot
>
> Resources containing static lookup data (item registries, behaviour tables, sprite-frame name maps) should NOT be registered with the snapshotter. They rehydrate via the same startup-stage system that ran originally (e.g. `setup_<sub>`). Document the contract in code with a comment on the resource declaration: `// NOT snapshotted — static config, rehydrated by setup_<sub>`.
>
> This composes with §2: the restore target's boot tick rehydrates the static config; restore re-populates the dynamic state on top.
>
> Loot's `item_registry_r` is the canonical example. See FRICTION.md §3.

---

## 4. Transient state lives in factory closures, not resources

**Target section:** new subsection under "Forge API gotchas".

> ### Transient state in factory closures, not resources
>
> Anything in the resource bag is contracted into the snapshot surface. Click queues, animation pending-flags, network in-flight requests, DOM event buffers — anything that must NOT survive snapshot/restore — belongs in a factory closure, not a resource.
>
> Pattern: `make_<system>(): { system: System; <imperative_setter>(): void }`. The returned system is registered; the imperative setters are called by DOM handlers / replay bridges / etc. The closure-captured state never enters the snapshot surface.
>
> Loot's inventory click queue is the canonical example: `make_inventory_system(): { system, queue_click }`. See `subsystems/loot/src/systems/inventory.ts` and FRICTION.md §4.

---

## 5. Game-side UI overlays install on `app.stage` and mirror surface_sprite

**Target section:** "Rendering conventions".

> ### Game UI overlays — `app.stage` sibling, mirror surface_sprite scale/offset
>
> Primary game UI (inventory modal, dialogue panel, perk-choice overlay) goes on `app.stage` as a **sibling of `surface_sprite`**, NOT inside `app.render.world` (which gets the lighting filter), NOT on `app.render.debug_overlay` (semantically reserved for debug HUDs).
>
> The overlay container must manually mirror `surface_sprite.scale.x` and `surface_sprite.position.{x,y}` so design-space layout works. Apply the mirror **once at boot** AND **on every `app.render.resize()` callback** — NOT per-tick (wasted work for state that changes only on resize).
>
> `event_to_world` works for hit-testing because the overlay shares `surface_sprite`'s design-coord system once mirrored.
>
> See `subsystems/loot/src/main.ts` and FRICTION.md §5.

---

## 6. Sibling z-order in `app.stage` — use `addChildAt(idx)`, not `addChild`

**Target section:** "Rendering conventions" (extends §5 above).

> ### Sibling z-order in `app.stage`
>
> Forge's built-in `app.stage` children render bottom-to-top in this order: `surface_sprite`, `debug_overlay`, `palette_overlay`. To insert a new sibling deterministically between them, use:
>
> ```ts
> const idx = app.app.stage.getChildIndex(palette_overlay);
> app.app.stage.addChildAt(my_overlay, idx);
> ```
>
> Plain `app.app.stage.addChild(my_overlay)` always appends at the top — wrong if you want the modal below the palette overlay. Note `app.app.stage` (the underlying Pixi `Application.stage`) vs `app.stage` (a re-export convenience).
>
> See `subsystems/loot/src/main.ts:120` and FRICTION.md §6.

---

## 7. Synthetic action bindings as the replay-stable UI input channel

**Target section:** new subsection under "Forge API gotchas" or "Rendering conventions".

> ### Synthetic action bindings for replay-recordable UI clicks
>
> DOM `pointerdown` does not flow through forge's bindings layer, so it is NOT in the replay stream. To make UI clicks replay-deterministic, wire each UI action as a digital action binding on a reserved key (e.g. `slot_click_0..11` bound to `F1..F12`). Real users never press these. The recorder emits them when the DOM handler fires; the replay-player consumes them via a tiny bridge system that calls the same imperative setter (e.g. `queue_click`) as the real DOM handler.
>
> This avoids extending the replay schema. Comment in `bindings.ts` explaining why `F1..F12` exist.
>
> See `subsystems/loot/src/bindings.ts` + `src/systems/synthetic-slot-click.ts` and FRICTION.md §7.

---

## 8. Bun harness `harness.tick()` only runs the `update` stage

**Target section:** "Build / test / deploy" (alongside the bun test timeout note).

> ### `harness.tick()` runs only `update` — pre-seed for tests
>
> The bun test harness's `tick()` method runs only the `update` stage. `startup`, `pre`, `post`, and `render` stages are skipped. Tests that need world state pre-seeded should set resources + spawn entities directly (e.g. `ctx.res.set(item_registry_r, make_test_registry())`) rather than relying on `startup`-stage systems to do it.
>
> This bites every time a new subsystem writes its first test fixture. Document the seed helpers in `test/fixtures/<sub>-scenario.ts`.
>
> See `subsystems/loot/test/fixtures/loot-scenario.ts` and FRICTION.md §11.

---

## 9. PLAN.md §7 LOC budgets understate by ~3× — re-baseline using empirical multiplier

**Target section:** `PLAN.md` §7 (root). Suggested edit, not AGENTS.md addition.

> ### LOC budget multiplier
>
> Arena: 2.6× of an 810 budget. Loot: 3.17× of an 890 budget (2.25× excluding tests + debug fixture). PLAN.md §7 budgets don't size tests + debug fixture as separate columns, and they collapse "X system" rows that ship as 2–3 separate testable systems.
>
> Re-baseline phase-5 (`progress`) onwards by applying the empirical 2.5–3× multiplier, OR break budgets into "core code / tests / debug fixture" columns. Current §7 budgets understate by ~3× consistently; this is a planning failure mode, not noise.
>
> See `subsystems/arena/PLAN.md` §5 phase totals and `subsystems/loot/PLAN.md` §5 phase totals.

---

## Notes for reviewer

- Items 1–4 are the biggest deliverables — they document non-obvious snapshot/restore failure modes that bit hard during Phases 4.5–4.6. Strongest case for inclusion.
- Items 5–6 are UI-overlay patterns the next UI-owning subsystem (`hub` dialogue, `progress` perk-choice) will hit unless documented. Effectively stack on top of arena's PROPOSED-AGENTS-UPDATES.md §4 ("Camera shake via `app.render.set_screen_offset`") as the second `app.stage`-touching convention.
- Item 7 is the most clever / least obvious — strong case for AGENTS.md merge because a future agent will absolutely try to "simplify" the synthetic-binding trick into "just record mouse coords directly" and break replay.
- Item 8 is generic bun-test ergonomics; arguably belongs in the root-level "Build / test / deploy" rather than echo-specific AGENTS.md.
- Item 9 is a PLAN.md edit, not an AGENTS.md addition. Surfaces a recurring planning miss.
