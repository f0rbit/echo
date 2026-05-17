# loot — subsystem plan

> Status: **shipped (2026-05-17)**. All 8 phases landed on `main` in commits `b235c96` → `5f6f63d` plus this docs commit. See "Deviations from plan" at the bottom for corrections made during implementation. FRICTION.md is the working-notes companion.
>
> Commit chain: `b235c96` (4.0 scaffold) → `7496eac` (4.1 items + Zod) → `c66b114` (4.2 inventory + equipment + stats) → `f089988` (4.3 pickups + arena-gen + plugin) → `410b074` (4.4 inventory UI + stat HUD) → `5a16434` (4.5 snapshot + replay) → `5f6f63d` (4.6 debug fixture) → this commit (4.7 docs).
>
> Audience: future Claude sessions, future agents, the user. Single source of truth for the `loot` subsystem.
>
> Parents:
> - `~/dev/echo/PLAN.md` §4.4 (subsystem catalogue entry), §5 (forge promotion gates), §7 Phase 4 (LOC table).
> - `~/dev/echo/AGENTS.md` "Rendering conventions" + "Forge API gotchas" (non-negotiable).
> - `~/dev/echo/subsystems/arena/PLAN.md` (canonical "shipped subsystem" plan format).
> - `~/dev/echo/subsystems/arena/PROPOSED-AGENTS-UPDATES.md` (un-merged conventions; items relevant to loot flagged in §2 and §11).
> - `~/dev/echo/subsystems/arena/FRICTION.md` (what bit arena; avoid the same friction here).
>
> Sibling reference. Loot mirrors **bestiary's structural shape** for cell-step subsystems (see §2 Q1): cell-stepped player, `g.move_tile`, `pos_c` + `visual_pos_c` + `tween_step_system`. **Not** arena's continuous-motion model. Arena's hit-feedback stack (hitstop, particles, shake, light-fx) is intentionally absent — see §2 Q8.

---

## 1. Goals and non-goals

### Goals

- **RPG-inventory pillar.** PLAN.md §4.4 / Pillar (implied): "Pick up items, equip them, see stat modifiers compose."
- **Mechanics scope (per PLAN.md §4.4):**
  - 320×180 single-room arena (same shape as `arena`'s room — boundary walls only, no enemies).
  - Pickups (potions, rings, swords) scattered around the floor. Walk-over auto-collect (§2 Q6).
  - 12-slot inventory grid; press `I` to toggle the overlay; click slot to equip / use.
  - Equipment slots: **weapon, offhand, ring1, ring2** (4 slots).
  - Equipped items contribute stat modifiers; recompute composes additively for absolute stats (`+5 atk`) and multiplicatively for ratio stats (`+10% spd`) — see §2 Q3 for which is which.
  - Top-right HUD stat panel showing current effective `atk / def / spd / hp`.
- **Snapshot round-trip is the load-bearing test.** PLAN.md §4.4: "Inventory state must round-trip through `snap`/`restore`." `replays/equip-and-stat.replay.json` exercises snapshot mid-replay → restore → continue → identical final state (§6).
- **Replay-as-test gate.** Same shape as bestiary + arena: `seed=1`, scripted action stream, end-state assertions on `stats_c` and `inventory_c.slots`.
- **Debug fixture page.** `subsystems/loot/debug/` deterministically spawns N items at fixed cells, scripts an auto-pickup walk, opens inventory, equips a sword + ring, asserts stat panel updates visually (per AGENTS.md "Debug fixture pattern"; per arena FRICTION.md §9 the `debug.html` script tag references `./main.js` after build-time rename).

### Non-goals

- **Combat / enemies.** Phase 3 (arena) owns combat; phase 5 (progress) reuses it. Loot has no `health_c` deduction, no hit feedback. Player can't die.
- **Stat-driven gameplay.** Stats are computed and displayed; nothing in the room consumes them. Validating composition math is the demo, not validating their downstream effect.
- **Item consumables.** "Use" on a potion is a no-op stub in v1 (it could remove the item from the slot; PLAN.md §4.4 doesn't require it). Default: clicking a non-equippable item just selects it; clicking again or pressing `Q` drops it back into the world. See §2 Q9.
- **Drag-and-drop reordering.** Slots are addressed by position; click-to-equip moves an item between bag and equipment slot. No drag.
- **Tooltips on hover.** Selected-slot info panel only.
- **FOV / lighting.** No FOV (matches arena Q4). **No lighting filter either** — see §2 Q8.
- **Real art.** `__default__` atlas; coloured-square sprites for pickups (per PLAN.md OQ-5).
- **Audio.** Out per PLAN.md OQ-6.
- **Saving inventory to disk.** Snapshot round-trip is in-memory only. Disk save/load is phase 5 (`progress`).

---

## 2. Design questions resolved (with rationale)

### Q1. Cell-step vs continuous motion

PLAN.md §4.4 doesn't specify. Arena went continuous because melee arcs + projectile speeds make continuous mandatory. Loot has no combat.

**Decision: cell-step movement.** Match `bestiary` + `dungeon-walk`. `g.move_tile` for the player; `pos_c` snapped to cell centres; `visual_pos_c` lerped via `tween_step_system` for smoothness.

**Rationale:**
- No combat → no arc geometry → no continuous-position requirement.
- Cell-step is simpler — 1 fewer component (`vel_c`), 1 fewer integration system, no clamp-to-canvas math (the grid bounds itself).
- Pickup overlap detection is exact (cell == pickup_cell, not circle-vs-circle).
- Aligns with bestiary's `tween.ts` + `creature_occupancy` patterns we already trust.

**Consequence (call out in AGENTS.md):** loot brings `visual_pos_c` + `tween_step_system` back into play. Subsystems pick one motion model at scaffold time and don't mix. Documented in arena PROPOSED-AGENTS-UPDATES.md §3; loot is the second consumer of cell-step in the post-arena era, which strengthens the case for promoting "cell-step vs continuous" into AGENTS.md.

### Q2. Item identity — Zod-validated registry, integer-id references

Items are **static data**: a `potion_of_healing` has `+10 hp`, a `ring_of_haste` has `+15% spd`. Every pickup of "ring of haste" is the same item. Two paths:
- (a) Item is a class/object with embedded behaviour; components store the object directly.
- (b) Item is a row in a registry keyed by string id; components reference items by id only.

**Decision: (b) string-id registry.** `item_registry_r: { items: Map<ItemId, ItemDef> }` initialised at startup. Components carry `ItemId` (a branded string), not `ItemDef`.

**Rationale:**
- Snapshot serialization: `inventory_c.slots: (ItemId | null)[]` is 12 short strings; `equipment_c: { weapon: ItemId | null, ... }` is 4 strings. Trivially JSON-serializable. **No Map / class-instance encoding needed.**
- Item defs never change at runtime — they live in `data/items.ts` as a static object literal, frozen at import time. The registry resource holds the same lookup but in `Map` form for ergonomic access. **The registry itself is NOT snapshotted** (it's static config, rehydrated by `arena-gen` on every restore).
- Zod schemas validate items at registry-build time, not per-snapshot.

**Component shapes (full):**
```ts
type ItemId = string & { __brand: "ItemId" };
type StatModifier = {
  atk?: number;     // additive
  def?: number;     // additive
  hp?: number;      // additive (max-hp delta)
  spd_mul?: number; // multiplicative (1.1 = +10% spd)
  crit_mul?: number;// multiplicative (future-proof; v1 may skip)
};
type ItemKind = "weapon" | "offhand" | "ring" | "potion";
type ItemDef = {
  id: ItemId;
  name: string;        // for HUD ("Sword of Fire")
  kind: ItemKind;
  modifier: StatModifier;
  color: number;       // tint for the placeholder square sprite
};
```

### Q3. Stat composition order (additive vs multiplicative)

**Decision (final):**
- `atk`, `def`, `hp` — **additive**. Base + sum of equipped modifiers. E.g., base atk 5 + sword +3 = 8. Negative modifiers (cursed items, future) clamp to ≥ 0.
- `spd` — **multiplicative**. Base × product of `(1 + spd_mul)`. E.g., base spd 1.0 × (1 + 0.10) × (1 + 0.15) = 1.265.
- Reason: additive on absolute counts, multiplicative on ratios. Matches how most ARPGs read in plain English ("plus 5 attack", "10% faster"). Avoids "+5% atk" ambiguity (is it 5% of base, 5% of current with other modifiers?).

**Composition is a pure function** `compute_stats(base: Stats, equipment: Equipment, registry: ItemRegistry): Stats`. Called from the `update`-stage `stats_recompute_system` whenever an equipment slot changes (track via `inventory_ui_r.dirty_stats: boolean`, set on equip/unequip, cleared after recompute).

**Initial base stats** (placeholder, balanced so a fully-equipped run shows visible change):
```
base = { atk: 5, def: 2, spd: 1.0, hp: 10 }
```

### Q4. Inventory UI: own container, sibling of `surface_sprite` on `app.stage`

PLAN.md §4.4: "ships a Pixi-Container-based inventory grid as game-side code". Options:
- (a) Add to `app.render.world` — gets the lighting filter treatment. Wrong, but irrelevant here since lighting is disabled (Q8).
- (b) Add to `app.render.debug_overlay` — unfiltered overlay container. Designed for debug HUDs (per AGENTS.md "Rendering conventions"). The stat panel HUD does belong here. The inventory overlay is *also* unfiltered, but it's a primary game UI, not debug — overloading `debug_overlay` muddles the convention.
- (c) Add a **new sibling Container on `app.stage`**, z-positioned above `surface_sprite` and below `palette_overlay`.

**Decision: (c) for the inventory overlay; (b) for the stat panel HUD.**

**Rationale:**
- Stat panel is a 4-line text block, exactly the shape `debug_overlay` is for. It mirrors arena's `debug-overlay.ts` HUD pattern verbatim. Toggle isn't needed — it's always on.
- Inventory overlay is a 12-slot grid with click hit-testing, a selection cursor, "equipped" highlight rings, and an info panel. Substantial. Conceptually a "modal" — when open, it dims/captures input.
- A separate container `inventory_ui_container` on `app.stage` makes the z-stack explicit: `surface_sprite` (game) → `inventory_ui_container` (modal UI, visible only when open) → `debug_overlay` (HUD always on top of game; below modal? above? — see below).

**Z-stack (top to bottom, per `app.stage` child order):**
```
palette_overlay        (forge built-in, always topmost)
inventory_ui_container (new sibling; visible iff inventory_ui_r.open)
debug_overlay          (HUD; sits below inventory modal when modal is open)
surface_sprite         (game; design canvas)
```

So when inventory is open, it sits ABOVE the HUD. The HUD pokes through under it for non-overlapping pixels. That's fine — the modal is mostly opaque (slot rects + a dimmed backdrop).

**Implementation note (boot wiring).** `app.stage.addChild(inventory_ui_container)` after boot returns; install at index `≥ surface_sprite.zIndex` but `< palette_overlay.zIndex` (or just `addChild` post-render and trust insertion order). See `subsystems/arena/src/main.ts:46–66` for the precedent of mutating `app.render.world` post-boot; same pattern, different target.

### Q5. Click handling for inventory slots — DOM `pointerdown` + `event_to_world`

Forge's `event_to_world(e, canvas, app.camera)` handles `getBoundingClientRect` + DPR + the two-stage RenderTexture pipeline (per AGENTS.md "Canvas → world coords"). It returns design-canvas coords.

The inventory overlay is on `app.stage`, not inside `app.render.world` — so its hit math runs in **window coords**, not design coords. Two viable approaches:
- (a) Apply the inverse of `surface_sprite` scale + offset to map window → design, then check slot rects in design space.
- (b) Layout the inventory grid directly in window coords (slots positioned by reading `vp.scale` and `vp.offset` each tick / on resize), and hit-test in window space.

**Decision: (a) — apply inverse transform, hit-test in design space.** The overlay's child Graphics + Text are positioned in design coords *inside* `inventory_ui_container`, and `inventory_ui_container.scale.set(vp.scale, vp.scale); inventory_ui_container.position.set(vp.offset.x, vp.offset.y)` is applied each frame (cheap; mirrors what `surface_sprite` does). Hit-testing: convert `e.clientX/Y` → design via the same math `event_to_world` uses for `app.render.world` (DPR-scaled bounding-rect math, divided by `vp.scale`, minus `vp.offset`). Slot rects are stored in design coords.

This means **we can reuse `event_to_world`** but instead of `app.camera.screen_to_world` (which assumes target = `app.render.world`), we call the equivalent math manually. The cleaner approach:

```ts
// in inventory-ui.ts
const slot_at = (x_design: number, y_design: number): number | null => {
  // returns 0..11 if hit, null otherwise
  for (let i = 0; i < 12; i++) {
    const r = slot_rects[i];
    if (x_design >= r.x && x_design <= r.x + r.w && y_design >= r.y && y_design <= r.y + r.h) return i;
  }
  return null;
};

canvas.addEventListener("pointerdown", e => {
  if (!inventory_ui_r.value.open) return;
  const { x, y } = event_to_world(e, canvas, app.camera);
  // event_to_world returns world coords for app.render.world. The inventory
  // overlay shares the same design-canvas footprint as app.render.world.
  // So design-coords from event_to_world == design-coords for the inventory UI.
  // (Works because inventory_ui_container.position+scale mirrors surface_sprite.)
  const idx = slot_at(x, y);
  if (idx !== null) on_slot_click(idx);
});
```

**Forge gotcha avoided:** never reimplement `fit_scale` (per AGENTS.md). `event_to_world` already does it. The inventory overlay just piggybacks on the same design-coords system.

**Replay determinism:** click events are **NOT recorded in replays**. The replay fixture uses the synthetic `ticked` / `scripted` input source for keyboard, plus a separate scripted "synthetic slot click" mechanism that pushes an internal action into `inventory_ui_r` (see §6). Real DOM `pointerdown` only fires in the browser; the replay player sets `inventory_ui_r.pending_click_idx` directly. This is intentional — replays test logic, not the click pipeline.

### Q6. Pickup mechanism — walk-over auto-collect

PLAN.md §4.4: "Walk over a pickup → it goes into inventory." Confirmed automatic. No press-to-pickup gate.

**System (`pickups.ts`):** every tick, query `[pos_c, pickup_c]` and compare cell to player's cell (via `g.world_to_cell`). On match: spawn an `inventory_add_event` (or set a per-tick flag in `inventory_r.pending_add`); `inventory.ts` consumes events in same-tick phase order to add to first empty slot. Inventory full → pickup stays on the floor (no auto-drop replacement). Surface friction in FRICTION.md if it bites.

**Edge case:** "what if two pickups are on the same cell?" — by construction (arena-gen.ts spawns no two pickups on the same cell), this can't happen. Asserted in the gen system.

### Q7. Walls / boundary

PLAN.md §4.4: same room as arena minus enemies; arena has no interior walls.

**Decision: no `wall_c`, no autotile.** Same as arena Q5. Movement clamps via `g.in_bounds(cell.x, cell.y)`. Visual contract: edge of canvas is the boundary.

Saves ~150 LOC of wall pipeline (bestiary autotile + index + debug). Background is a single dark-grey `Graphics` rect inside `app.render.world` like arena does.

### Q8. Lighting — skip entirely

Arena uses `@f0rbit/forge/light` with `ambient = (1,1,1)` purely as a screen-flash / hit-glow primitive (per arena Q4 + PROPOSED-AGENTS-UPDATES.md §5). Loot has no combat → no flashes needed.

**Decision: no lighting filter.** Drop `make_light_system`, drop `app.render.world.filters`, drop `light.update` render-stage system. Saves ~80 LOC and ~0.2 ms/frame.

**Consequences (call out in FRICTION.md / AGENTS.md if surfaced):**
- No glow effects on pickups (a small juice-loss we accept). If desired later, add a single eye-light following the player at low-intensity ambient pulse — but reject for v1.
- Subsystems pick one lighting model per scaffold. Both "lighting on, ambient `(1,1,1)`" (arena) and "lighting off entirely" (loot) are valid; the choice is feel-driven.

### Q9. Item interaction model — click semantics

When inventory is open and player clicks a slot:
- **Empty slot** → no-op.
- **Slot holds a weapon / offhand / ring** → **toggle equip**. If the corresponding equipment slot is empty, the item moves from `inventory_c.slots[i]` to `equipment_c.<slot>`. If the equipment slot is occupied, the items swap (the equipped item goes to slot `i`). For ring: prefer empty `ring1`, then `ring2`, then swap with `ring1` (deterministic policy; documented for replay).
- **Slot holds a potion** → in v1: **drop back to floor**. (PLAN.md §4.4 says "equip / use" — we ship "equip non-potions; drop potions back" for simplicity. Potion consumption ("+10 hp") is meaningful only when a player can take damage — that's `arena`'s territory; we'd be testing a no-op in this subsystem.)

**Drop-to-floor:** spawn a pickup at the player's current cell with the item's id; nullify the inventory slot. If a pickup already exists on that cell, drop on an adjacent open cell (4-neighbour scan; if none open, no-op and log).

**Equipping a stat-bearing item triggers `inventory_ui_r.dirty_stats = true`**. `stats_recompute_system` reads in same tick and updates `stats_c` on the player.

**Open question — accept as decided:** OQ-L3 (§8) confirms this is the v1 interaction set. Drag-and-drop and consumable use are post-Phase 4.

### Q10. Snapshot scope — what's serialized

Per forge's `snapshotter` API: only **registered** components and resources are taken. Everything else is "runtime-only state" (see `forge/test/storage/snapshot.test.ts` ll. 139–149 — "take skips unregistered components silently").

**Registered for snapshot:**

| Surface | Registered? | Schema | Reason |
|---|---|---|---|
| `pos_c` | yes | `{x, y}` | Player position |
| `visual_pos_c` | yes | `{x, y}` | Tween smoothing state (small; preserves visual continuity post-restore) |
| `pickup_c` | yes | `{ item_id }` | Floor pickups are world state |
| `player_c` | yes | marker (no payload schema needed) | Tag |
| `inventory_c` | yes | `{ slots: (ItemId \| null)[] }` (length-12) | Core demo state |
| `equipment_c` | yes | `{ weapon, offhand, ring1, ring2: ItemId\|null }` | Core demo state |
| `stats_c` | yes | `{ atk, def, spd, hp }` | Derived but cheap to round-trip; spares re-running `recompute` post-restore |
| `arena_r` (cols/rows/floors/spawn) | yes | (matches bestiary) | World gen state |
| `run_seed_r` | yes | `{ base, restart_count }` | Determinism + restart semantics |
| `inventory_ui_r` | **partial** | `{ open: bool, selected: number\|null }` only — NOT `pending_click_idx` (transient) | UI mode survives a restore; pending events don't |

**NOT registered (transient or runtime asset):**
- `item_registry_r` — static config, rebuilt at startup by `arena-gen`. Restoring an inventory containing `"item.sword_of_fire"` works because the registry exists fresh; ids match because we keep ids stable across version bumps (documented in `data/items.ts`).
- `flash_c` (if loot adds any cosmetic flash; v1 doesn't), `lifetime_c` — runtime-only.
- Anything from arena that loot doesn't carry (hit_events_r, particles_r, hitstop_r, camera_shake_r, wave_r).

**Restore semantics:** after `restore(w, snap, { time, rng, res })`:
- `inventory_c.slots` and `equipment_c.*` round-trip byte-identical (JSON.stringify equality).
- `stats_c` round-trips byte-identical (because it was saved, even though it's derived — cheaper than re-running recompute on restore).
- The inventory UI overlay re-renders from `inventory_ui_r.open + selected` plus `inventory_c.slots` on next post-stage tick.

**Implementation gotcha:** the `Snapshotter.register` API is *chainable* and returns `Snapshotter` (per `forge/src/snapshot.ts:32–37`). Pattern:

```ts
// game-side helper used by both main.ts and replay tests
export const make_loot_snapshotter = (): Snapshotter =>
  snapshotter()
    .register(pos_c)                      // schema optional; forge skips validation if absent
    .register(visual_pos_c)
    .register(player_c)
    .register(pickup_c, pickup_schema)
    .register(inventory_c, inventory_schema)
    .register(equipment_c, equipment_schema)
    .register(stats_c, stats_schema)
    .register_resource(arena_r, arena_schema)
    .register_resource(run_seed_r, run_seed_schema)
    .register_resource(inventory_ui_r, inventory_ui_schema);
```

**Zod schemas live in `data/schemas.ts`** (a new file; not `data/items.ts` which is content). Component types and Zod schemas stay in lock-step — bestiary/arena currently keep components as `type` only without Zod registration (because they don't snapshot), which is why loot is the first echo subsystem to need this.

### Q11. Where the registry lookup happens

`compute_stats` and the HUD both need `item_registry_r` to resolve `ItemId → ItemDef`. The registry is set up by `arena-gen` (startup phase) before any system needs it. Systems read via `ctx.res.get(item_registry_r)`.

For replay tests: the test harness runs `game_plugin(h.world, h.schedule)`, which calls `arena-gen` on the first `pre` tick → registry is populated before any update tick fires. **No bootstrap order issues** as long as we keep `item_registry_setup` in `startup` stage at phase 0.

---

## 3. File-level scope

Mirrors bestiary's package shape exactly. **Forge stays on `^0.4.3`** — no forge bump expected for loot (§4).

```
~/dev/echo/subsystems/loot/
├── package.json                    # @f0rbit/forge@^0.4.3
├── tsconfig.json                   # extends echo root; alias @lt/*
├── index.html                      # mirror of arena/index.html
├── debug.html                      # debug fixture entry HTML
├── FRICTION.md                     # subsystem-specific friction log (post-ship)
├── PLAN.md                         # this file, promoted at Phase 4.7
├── public/
│   └── (no atlases — coloured-square __default__ frames)
├── src/
│   ├── components.ts               # ~60 LOC — player_c, pickup_c, inventory_c, equipment_c,
│   │                               #          stats_c, visual_pos_c
│   ├── resources.ts                # ~50 LOC — arena_r, run_seed_r, item_registry_r,
│   │                               #          inventory_ui_r
│   ├── bindings.ts                 # ~25 LOC — WASD/arrow move + I inventory + R restart + Tab debug
│   ├── grid.ts                     # ~5 LOC  — g = grid({ cols: 20, rows: 11, tile: 16 })
│   ├── arena-gen.ts                # ~100 LOC — startup: spawn player + background rect +
│   │                               #          item_registry_r setup + scatter 8–10 pickups
│   ├── plugin.ts                   # ~80 LOC — game_plugin(world, schedule, opts)
│   ├── main.ts                     # ~80 LOC — boot wiring, inventory_ui_container install
│   ├── main-debug.ts               # ~80 LOC — debug fixture entry (companion to main.ts)
│   ├── debug-plugin.ts             # ~80 LOC — stripped plugin: scripted pickups + auto-walk
│   ├── data/
│   │   ├── items.ts                # ~130 LOC — 12 sample items (3 weapons, 2 offhands,
│   │   │                           #          4 rings, 3 potions). Frozen TS literal.
│   │   └── schemas.ts              # ~60 LOC — Zod schemas for registered components / resources
│   └── systems/
│       ├── input.ts                # ~40 LOC — reads movement + I toggle + R restart
│       ├── movement.ts             # ~50 LOC — cell-step via g.move_tile (mirrors bestiary)
│       ├── tween.ts                # ~40 LOC — copy of bestiary/tween.ts; visual_pos lerp
│       ├── pickups.ts              # ~60 LOC — walk-over collection, fires inventory_add events
│       ├── inventory.ts            # ~120 LOC — slot management, consume add events,
│       │                           #          handle click → equip / drop, swap logic
│       ├── equipment.ts            # ~80 LOC — equip/unequip ops, dirty_stats flag
│       ├── stats.ts                # ~80 LOC — compute_stats(base, equipment, registry);
│       │                           #          recompute system reads inventory_ui_r.dirty_stats
│       ├── inventory-ui.ts         # ~200 LOC — Pixi Container overlay on app.stage,
│       │                           #          12 slot rects, selection cursor, info panel,
│       │                           #          DOM pointerdown handler (event_to_world)
│       ├── stat-panel-hud.ts       # ~60 LOC — top-right Text panel on app.render.debug_overlay
│       ├── restart.ts              # ~40 LOC — R: world.clear(); regenerate; reset everything
│       └── sprite-attach.ts        # ~30 LOC — copy of bestiary pattern (pickup colour-square sprites)
├── replays/
│   └── equip-and-stat.replay.json  # scripted: walk → pickup 3 items → open inventory →
│   │                               #          click sword → click ring → snapshot →
│   │                               #          restore → click ring2 → final stats assertion
├── test/
│   ├── replay.test.ts              # ~200 LOC — full replay including mid-replay snap+restore
│   ├── snapshot.test.ts            # ~150 LOC — focused snapshot round-trip unit tests
│   ├── inventory.test.ts           # ~80 LOC  — slot ops, swap rules, ring slot policy
│   ├── stats.test.ts               # ~80 LOC  — compose math (additive + multiplicative)
│   ├── pickups.test.ts             # ~60 LOC  — walk-over detection, full-inventory edge case
│   ├── inventory-ui.test.ts        # ~60 LOC  — hit-test math (design-coord slot lookup)
│   └── fixtures/
│       └── loot-scenario.ts        # deterministic test-world builders + registry helpers
└── tools/
    └── record-equip-and-stat.ts    # ~120 LOC — record the canonical replay
```

### Forge-side

**None.** Snapshot, `event_to_world`, lighting (unused), and grid all exist in `@f0rbit/forge@0.4.3`. See §4 for the gap analysis.

---

## 4. Forge stress points — what exists, what's new

### What exists in forge v0.4.3 (no work needed)

| Surface | Path | Used by loot |
|---|---|---|
| `snapshotter()` + `.register` + `.register_resource` + `.take` + `.restore` | `forge/src/snapshot.ts` | **Load-bearing.** Inventory/equipment/stats round-trip. |
| `harness` (test rig) | `forge/src/harness.ts` | Replay-as-test infrastructure (same as bestiary, arena). |
| `replay.record` / `replay.play` / `replay.load` / `replay_schema` | `forge/src/replay.ts` | Replay-as-test. |
| `event_to_world(e, canvas, cam)` | `forge/src/pixi/coords.ts` | DOM-click → design coords for inventory slot hit-testing (§2 Q5). |
| `@f0rbit/forge/grid` `g.move_tile` / `g.in_bounds` / `g.world_to_cell` / `g.cell_to_world` | `forge/src/grid/` | Cell-step movement (§2 Q1), pickup overlap detection (§2 Q6). |
| `pos_c` | `forge/src/index.ts` | Cell-snapped position. |
| `sprite_c` + `sprite_sync_system` + `sprite.set` | `forge/src/pixi/sprite.ts` | Pickup colour-square rendering, player sprite. |
| `world.spawn_many` / `world.despawn` / `world.clear()` | `forge/src/world.ts` | Pickup scatter, restart, drop-to-floor. |
| `app.render.debug_overlay` (unfiltered container) | `forge/src/pixi/render.ts` | Stat panel HUD lives here (§2 Q4). |
| `app.stage` (top-level pixi container) | `forge/src/pixi/index.ts` | Inventory overlay sibling installs here (§2 Q4). |
| `palette` | `forge/src/palette/` | `/give sword_of_fire`, `/clear-inventory`, `/snap` debug commands (§2 stretch). |

### Gap analysis

No forge gaps blocking loot. The snapshot API handles class-instance-free state cleanly:

- **Maps with non-primitive values would be a gap** (snapshot serializes via `JSON.stringify` round-trip implicit in `safeParse`, so a `Map<string, ItemDef>` resource would lose its `Map`-ness — keys/values would serialize as a plain object). **We avoid this entirely by not snapshotting the registry** (it's static config, rehydrated at startup). The inventory `slots` is `(ItemId | null)[]` — already a plain array of strings or nulls.
- **Classes for items would be a gap** (instance methods can't survive JSON round-trip). **We avoid this by making items plain object literals** in `data/items.ts`, looked up by id.

### Forge promotion candidates surfaced (record only, do not promote)

| # | Candidate | Strength | Notes |
|---|---|---|---|
| 1 | UI helpers — `forge.ui` subpath (panel, grid, button, hover) | Low (this phase). Becomes Medium when `hub` (dialogue panel) + `progress` (perk-choice modal) ship. **Hold game-side per PLAN.md §4.4** until the 3rd UI-owning subsystem confirms. | This is the explicit "third subsystem trips the gate" pattern from PLAN.md §5. |
| 2 | Inventory grid helper — `forge.inventory` | Drop | Too game-specific. |
| 3 | DOM click → design coords helper (already `event_to_world`) | Exists | Nothing new. |
| 4 | Stat composition helper | Drop | 5 LOC game-side. |

**Forge change in this phase: none.** Arena's `package.json` is at `@f0rbit/forge@0.4.3`; loot mirrors. Drift policy per PLAN.md §5.

---

## 5. Phasing

Each phase ends with verification (typecheck + test + lint) and an atomic commit. **Per arena FRICTION.md §6**, worktree base-ref unreliability bit Phase 3.2 when worktrees were ≤500 LOC. Arena's remaining parallel phases (3.3, 3.4, 3.6) ran sequential with no measurable slowdown.

**Decision: every loot phase runs sequential single-coder.** No worktrees. Loot's phases are 200–500 LOC each — well under the threshold where parallel pays. The coordination cost (merge + plugin wiring + verifier integration) consistently exceeded the parallel speedup in arena.

This is a deliberate divergence from the arena/bestiary plan structure. The plan still calls out "would-be-parallel" boundaries for completeness; the recommendation is sequential.

### Phase 4.0 — Subsystem scaffold (sequential) — **SHIPPED** `b235c96`

Single `coder` (not `coder-fast`); scaffold is load-bearing.

| Task | LOC | Files |
|---|---|---|
| `subsystems/loot/package.json` + `tsconfig.json` + `index.html` + `debug.html` + `.gitignore` | ~80 | subsystems/loot/* |
| `src/components.ts` — components per §3 (player_c, pickup_c, inventory_c, equipment_c, stats_c, visual_pos_c) | ~60 | subsystems/loot/src/components.ts |
| `src/resources.ts` — resources per §3 (arena_r, run_seed_r, item_registry_r, inventory_ui_r) | ~50 | subsystems/loot/src/resources.ts |
| `src/bindings.ts` — merge_bindings(presets.movement_2d, { digital: { inventory_toggle: [I], restart: [R], debug_toggle: [Tab] } }) | ~25 | subsystems/loot/src/bindings.ts |
| `src/grid.ts` — g = grid({ cols: 20, rows: 11, tile: 16 }) | ~5 | subsystems/loot/src/grid.ts |
| `test/fixtures/loot-scenario.ts` — helpers (make_test_world, make_test_registry) | ~80 | subsystems/loot/test/fixtures/ |
| Verify `bun --filter loot typecheck` passes with empty plugin | 0 | (verification) |

**Deliverable.** Empty subsystem typechecks; folder structure exists. Wire root `bun --filter '*' build` to detect loot (auto via workspaces).

**LOC total.** ~300.

**Verification commit.** `feat(loot): scaffold subsystem`.

### Phase 4.1 — Items registry + Zod schemas (sequential) — **SHIPPED** `7496eac`

| Task | LOC | Files |
|---|---|---|
| `src/data/items.ts` — 12 sample ItemDef literals (3 weapons / 2 offhands / 4 rings / 3 potions) | ~130 | subsystems/loot/src/data/items.ts |
| `src/data/schemas.ts` — Zod schemas for ItemDef, StatModifier, pickup_c, inventory_c, equipment_c, stats_c, arena_r, run_seed_r, inventory_ui_r | ~80 | subsystems/loot/src/data/schemas.ts |
| Registry setup helper (consumed by `arena-gen` in Phase 4.3) | ~30 | inline in data/items.ts |
| `test/fixtures/loot-scenario.ts` — extend with `make_test_registry()` | ~20 | subsystems/loot/test/fixtures/loot-scenario.ts |
| Sanity test: every ItemDef passes its own Zod schema | ~40 | subsystems/loot/test/items.test.ts (new) |

**Deliverable.** `data/items.ts` exports `ITEMS: ReadonlyArray<ItemDef>` and `make_item_registry(): ItemRegistry`. Every item validates against `item_def_schema`.

**LOC total.** ~300.

**Verification commit.** `feat(loot): item registry + Zod schemas`.

### Phase 4.2 — Inventory + equipment + stats (sequential) — **SHIPPED** `c66b114`

Originally a candidate for 3-worktree parallel (A=inventory, B=equipment, C=stats). **Sequential, single coder.** All three modules share `inventory_ui_r.dirty_stats` plumbing and the registry lookup — easier to write coherently in one pass.

| Task | LOC | Files |
|---|---|---|
| `src/systems/inventory.ts` — slot management, swap logic, ring policy, drop-to-floor stub | ~120 | subsystems/loot/src/systems/inventory.ts |
| `src/systems/equipment.ts` — equip / unequip ops | ~80 | subsystems/loot/src/systems/equipment.ts |
| `src/systems/stats.ts` — compute_stats pure fn + recompute system | ~80 | subsystems/loot/src/systems/stats.ts |
| `test/inventory.test.ts` — slot ops, swap rules | ~80 | subsystems/loot/test/inventory.test.ts |
| `test/stats.test.ts` — compose math: additive + multiplicative; ring×2 stacking; zero modifier | ~80 | subsystems/loot/test/stats.test.ts |

**Deliverable.** All three systems unit-tested in isolation. No plugin wiring yet; tests use `loot-scenario.ts`.

**LOC total.** ~440.

**Verification commit.** `feat(loot): inventory + equipment + stats systems`.

### Phase 4.3 — Pickups + walk-over collection + arena gen (sequential) — **SHIPPED** `f089988`

| Task | LOC | Files |
|---|---|---|
| `src/arena-gen.ts` — startup system: spawn player + background rect, init item_registry_r, scatter 8–10 pickups at fixed cells (per seed) | ~100 | subsystems/loot/src/arena-gen.ts |
| `src/systems/pickups.ts` — walk-over detection; emit add events; despawn pickup entity on collect | ~60 | subsystems/loot/src/systems/pickups.ts |
| `src/systems/movement.ts` — cell-step (mirrors bestiary/movement.ts) | ~50 | subsystems/loot/src/systems/movement.ts |
| `src/systems/tween.ts` — copy bestiary/tween.ts (visual_pos lerp) | ~40 | subsystems/loot/src/systems/tween.ts |
| `src/systems/input.ts` — movement + inventory_toggle + restart | ~40 | subsystems/loot/src/systems/input.ts |
| `src/systems/restart.ts` — R key handler (world.clear + arena-gen re-run) | ~40 | subsystems/loot/src/systems/restart.ts |
| `src/systems/sprite-attach.ts` — copy bestiary pattern; tint by pickup item color | ~30 | subsystems/loot/src/systems/sprite-attach.ts |
| `src/plugin.ts` — wire startup → pre → update → post stage order | ~80 | subsystems/loot/src/plugin.ts |
| `test/pickups.test.ts` — walk-over collection; full-inventory edge case | ~60 | subsystems/loot/test/pickups.test.ts |

**Deliverable.** Headless: spawn world, simulate "walk through 3 pickup cells", assert 3 slots filled. No UI yet.

**LOC total.** ~500.

**Verification commit.** `feat(loot): pickups + walk-over collection + plugin wiring`.

### Phase 4.4 — Inventory UI overlay + stat panel HUD (sequential) — **SHIPPED** `410b074`

UI is fiddly; coder (not coder-fast).

| Task | LOC | Files |
|---|---|---|
| `src/systems/inventory-ui.ts` — Pixi Container overlay on app.stage; 12 slot rects (4×3 grid); selection cursor; info panel; DOM pointerdown handler via event_to_world | ~200 | subsystems/loot/src/systems/inventory-ui.ts |
| `src/systems/stat-panel-hud.ts` — top-right Text panel on app.render.debug_overlay | ~60 | subsystems/loot/src/systems/stat-panel-hud.ts |
| `src/main.ts` — boot wiring: install `inventory_ui_container` on app.stage; wire pointerdown teardown on tab-away | ~80 | subsystems/loot/src/main.ts |
| `test/inventory-ui.test.ts` — pure hit-test math: given (x, y) design coords, returns slot idx 0..11 or null | ~60 | subsystems/loot/test/inventory-ui.test.ts |

**Hit-test math is pure** (no Pixi); test it in isolation. Visual smoke (does the overlay actually render?) is post-deploy and falls to Phase 4.6 (debug fixture).

**Deliverable.** Browser: walk around, pick up items, press `I`, see grid with collected items, click slot, see item highlight + equip-state change.

**LOC total.** ~400.

**Verification commit.** `feat(loot): inventory UI overlay + stat panel HUD`.

### Phase 4.5 — Snapshot round-trip + replay fixture (sequential) — **SHIPPED** `5a16434`

Coder (not coder-fast); snapshot round-trip is load-bearing.

| Task | LOC | Files |
|---|---|---|
| `src/data/schemas.ts` — finalise Zod schemas; ensure every snapshot-registered surface has one | ~20 (additive) | subsystems/loot/src/data/schemas.ts |
| `tools/record-equip-and-stat.ts` — scripted: walk → pickup 3 items → I → click sword → click ring → snapshot mid-replay → restore → continue → click ring2 | ~120 | subsystems/loot/tools/record-equip-and-stat.ts |
| `replays/equip-and-stat.replay.json` — generated by tool | (data) | subsystems/loot/replays/equip-and-stat.replay.json |
| `test/snapshot.test.ts` — focused unit tests: take → restore round-trip on inventory state | ~150 | subsystems/loot/test/snapshot.test.ts |
| `test/replay.test.ts` — full replay-as-test with mid-replay snap → restore → continue | ~200 | subsystems/loot/test/replay.test.ts |

**Replay assertions (per §6 detail):**
- `stats_c.atk === expected_post_equip_value` after final action.
- `inventory_c.slots` has expected ItemId pattern.
- Mid-replay world-hash matches post-restore world-hash.
- End-of-replay world-hash matches expected (byte-stable across two consecutive recordings).

**Deliverable.** `bun --filter loot test test/replay.test.ts` green. Snapshot mid-replay is byte-stable.

**LOC total.** ~490.

**Verification commit.** `test(loot): replay-as-test fixture + snapshot round-trip`.

### Phase 4.6 — Debug fixture (sequential) — **SHIPPED** `5f6f63d`

| Task | LOC | Files |
|---|---|---|
| `src/main-debug.ts` — debug fixture boot (mirrors arena/main-debug.ts shape) | ~80 | subsystems/loot/src/main-debug.ts |
| `src/debug-plugin.ts` — stripped plugin: deterministic 6-item floor layout, auto-walk path that picks all up, then auto-opens inventory and auto-equips a sword + ring after T=240 ticks | ~80 | subsystems/loot/src/debug-plugin.ts |
| Build script in `package.json` (mirror arena's): `bun build src/main-debug.ts --outdir dist/debug && mv dist/debug/main-debug.js dist/debug/main.js && cp debug.html dist/debug/index.html` | ~5 | subsystems/loot/package.json |
| **Critical (per arena FRICTION.md §9 + PROPOSED-AGENTS-UPDATES.md §6):** `debug.html` script tag references `./main.js`, NOT `./main-debug.js` | (data) | subsystems/loot/debug.html |
| `test/debug-fixture.test.ts` — optional headless sanity (replays the debug auto-script for ~480 ticks and asserts final equipped sword + ring) | ~60 | subsystems/loot/test/ (skip if Phase 4.5's replay covers it) |

**Deliverable.** `/echo/loot/debug/` deploys. Page auto-runs: walks → picks up → opens inventory → equips. Visual smoke verifies the UI overlay renders correctly without manual input.

**LOC total.** ~225.

**Verification commit.** `feat(loot): debug fixture for inventory + snapshot verification`.

### Phase 4.7 — Polish + FRICTION.md + PLAN.md promotion + AGENTS.md proposals (sequential) — **SHIPPED** (this commit)

| Task | LOC | Files |
|---|---|---|
| `FRICTION.md` — friction discovered during loot dev | ~80 | subsystems/loot/FRICTION.md |
| `PLAN.md` — promote this `.plans/loot.md` into `subsystems/loot/PLAN.md` with status updated to "shipped" + Deviations section | ~varies | subsystems/loot/PLAN.md |
| `PROPOSED-AGENTS-UPDATES.md` — new conventions surfaced (see §11) | ~80 | subsystems/loot/PROPOSED-AGENTS-UPDATES.md |
| Update root `README.md` to list loot | ~5 | README.md |
| Final typecheck + lint + test sweep across the whole repo | 0 | (verification) |

**Verification commit.** `docs(loot): friction log + plan promotion + agents proposals`.

### Phase totals

| Phase | Echo LOC | Forge LOC | Parallel? | Status | Commit |
|---|---|---|---|---|---|
| 4.0 scaffold | ~300 | — | sequential | shipped | `b235c96` |
| 4.1 items registry + schemas | ~300 | — | sequential | shipped | `7496eac` |
| 4.2 inventory + equipment + stats | ~440 | — | sequential | shipped | `c66b114` |
| 4.3 pickups + arena gen + movement | ~500 | — | sequential | shipped | `f089988` |
| 4.4 inventory UI + stat HUD | ~400 | — | sequential | shipped | `410b074` |
| 4.5 snapshot + replay-as-test | ~490 | — | sequential | shipped | `5a16434` |
| 4.6 debug fixture | ~225 | — | sequential | shipped | `5f6f63d` |
| 4.7 polish + docs | ~165 | — | sequential | shipped | (this commit) |
| **Total** | **~2820** | **0** | | | |

PLAN.md §7 Phase 4 budgeted **~890 echo-side LOC**. This plan estimates ~2820 echo-side. **3.17× overshoot**, consistent with arena (2.6× of its 810 budget).

Causes (mirror arena's OQ-A9):
- PLAN.md didn't budget tests (~590 LOC of test files here).
- PLAN.md didn't budget debug fixture (~225 LOC).
- PLAN.md collapsed "snapshot test 60" into the replay test; we split into focused unit tests + replay-driven tests for clearer failure messages = ~350 LOC.
- PLAN.md didn't budget separate stats / equipment / inventory systems; we split for testability = ~280 LOC vs PLAN.md's combined ~150.

Without tests + debug fixture, echo-side is ~2005 LOC, still 2.25× the 890 budget. **Recommendation: accept the overshoot and update PLAN.md §7 once loot ships, mirroring arena's OQ-A9.** Flag in §11 as an AGENTS.md proposal: PLAN.md §7 should size budgets with tests + debug fixture explicitly included.

---

## 6. Replay determinism + snapshot round-trip strategy

### What `equip-and-stat.replay.json` records

Same shape as bestiary/arena replays. `ReplayDoc` with:
- `seed: 1`
- `fixed_dt: 1 / 60`
- `frames: [...]` — tick-keyed action events (move axes, I press, R press)

**Synthetic inventory click events** are recorded separately as a custom action embedded in the replay's input stream. Two implementation options:
- (a) Encode each click as a `digital` action firing on a unique key — e.g. `slot_click_0` ... `slot_click_11` as bindings, mapped to nothing in the real browser but settable via the recorder. Replay-player sets the action just like any other.
- (b) Extend the replay schema with a separate `ui_events` channel.

**Decision: (a).** Reuses the existing action / bindings machinery — no replay-schema extension, no forge change. Keys `slot_click_0..11` are bound to a sentinel scan code (e.g. `F1..F12` or unused codes); real users never press them. The recorder emits them; replay-player consumes them. Document the convention in `bindings.ts` and FRICTION.md.

### Replay test assertions

```ts
describe("loot replay deliverable", () => {
  test("replay loads + validates schema", () => { /* schema check */ });

  test("after pickup phase, inventory contains 3 specific items", () => {
    // advance_to(tick_after_third_pickup)
    // assert inventory_c.slots[0..2] === [sword_id, ring_id, potion_id]
  });

  test("after first equip click, equipment_c.weapon === sword_id", () => { /* */ });
  test("after first equip click, stats_c.atk === base.atk + sword.modifier.atk", () => { /* */ });

  test("snapshot round-trip mid-replay preserves world hash", () => {
    // advance_to(snap_tick)
    // const snap = snapper.take(w, { time, rng, res })
    // const w2 = world(); const t2 = time(); const r2 = rng(snap.meta.rng_seed); const res2 = resources();
    // snapper.restore(w2, snap, { time: t2, rng: r2, res: res2 })
    // assert world_hash(w, res) === world_hash(w2, res2)
  });

  test("continue from restored state, end state matches non-restored continuation", () => {
    // two parallel sims: one continues from the original world; one continues from the restored copy.
    // advance both to end_tick. assert world_hash equal.
  });

  test("stats_c.atk === expected_post_equip_value at end of replay", () => { /* */ });
  test("two consecutive replay runs produce byte-identical world hashes", () => { /* */ });
});
```

### World hash for loot

```ts
const world_hash = (sim) => sha256(JSON.stringify({
  player_pos: cell_of(player_c),
  player_visual_pos: visual_pos_of(player_c),    // tween state
  pickups: sorted_cell_pairs(cells_of(pickup_c)),
  pickup_items: sorted_items(items_of(pickup_c)),
  inventory: inventory_c_of(player_c).slots,       // (ItemId | null)[12]
  equipment: equipment_c_of(player_c),             // { weapon, offhand, ring1, ring2 }
  stats: stats_c_of(player_c),                     // { atk, def, spd, hp }
  ui: inventory_ui_r.value,                        // { open, selected }
  tick: sim.ctx.time.tick,
}));
```

### Determinism risks specific to loot

1. **Map iteration order in `item_registry_r`.** Items are accessed by id (string lookup); iteration order is never relied on in game logic (verified — only `arena-gen` iterates the registry to scatter, and that uses a sorted-by-id pass). **Mitigation:** add a lint rule / unit test ensuring registry iteration in game systems is always sorted-by-id.

2. **Slot click ordering when the same tick has multiple click events.** Replay can have at most one `slot_click_N` action per tick (action state is a per-tick boolean). If two clicks land on the same tick (impossible in real input, possible in scripted replays), only one fires. **Mitigation:** the recorder enforces one click per tick; document in FRICTION.md if it bites.

3. **Drop-to-floor adjacent-cell selection** when the player's current cell already has a pickup. Adjacent cells are scanned in a fixed N/E/S/W order; first open one wins. **Deterministic by construction.**

4. **`inventory_ui_r.selected` after a swap.** When a swap moves an item from inventory slot 3 to weapon slot, the cursor on slot 3 now points to the item that came back from weapon (if any) or null. **Specify and freeze the policy:** after equip/swap, `selected` stays on its slot index (doesn't follow the item). Tested in inventory.test.ts.

### Snapshot-specific failure modes

- **Component not registered.** If a coder adds a new component (e.g. cosmetic glow effect) and forgets to register it on `make_loot_snapshotter`, the snapshot test will fail with `component_not_registered` only if the new component has at least one entity at snap-time. Otherwise it silently disappears post-restore. **Mitigation:** the FRICTION.md note + a defensive test that enumerates all components on a fully-populated world and asserts each is either snapshotted or explicitly listed in a "runtime-only" allowlist.

- **Resource not registered.** Same shape — `inventory_ui_r` is registered; any future resource must be added explicitly. Watch this when adding new mid-Phase 4 resources.

- **Zod schema drift.** If `inventory_c.slots` schema requires `length === 12` and a future bug allows 13 slots, snapshot fails at validation. Strong signal; not a failure mode to mitigate, just to be aware of.

### Snapshotter ordering

`snapshotter().register(...)` is idempotent and order-independent for entity component snapshots — `take` iterates the registered components, building per-entity bags. Output is `entities.sort((a,b) => a.id - b.id)` (per `forge/src/snapshot.ts:102`). **Replay determinism: preserved.**

Resources are output in the order they were registered (Map insertion order in `resources_by_name`). `JSON.stringify` walks resources object keys in insertion order. **As long as `make_loot_snapshotter` is built the same way each test, the JSON is byte-stable.**

---

## 7. Migration / dependencies

### Echo workspace prerequisites (already in place)

- Root `package.json` lists `subsystems/*` in workspaces.
- Per-subsystem `package.json` shape established by bestiary + arena.
- `.github/workflows/pages.yml` aggregates `subsystems/<name>/dist`.

### New deps for loot

- `@f0rbit/forge@^0.4.3` (matches arena's pin; no bump).
- `@f0rbit/corpus@^0.3.5` (matches arena).
- `pixi.js@^8` (matches arena).
- `zod@^3.25.0` (matches arena — needed for schemas, snapshot validation).

### Subsystem version drift

Per PLAN.md §5. After loot ships:
- `dungeon-walk`: `@f0rbit/forge@^0.4.2`.
- `bestiary`: `@f0rbit/forge@^0.4.2`.
- `arena`: `@f0rbit/forge@0.4.3`.
- `loot`: `@f0rbit/forge@^0.4.3`.

Phase 8 absorbs the alignment.

### BREAKING changes

**None.** No forge changes. Per arena's pattern.

---

## 8. Open questions (resolved with rationale)

### OQ-L1. Item id format — string-branded or numeric?

**Resolved: string-branded.** `ItemId = string & { __brand: "ItemId" }`. Names like `"item.sword_of_fire"` are readable in snapshots and debugger; numeric ids force a separate name lookup. Length impact on snapshot JSON is negligible (12 short strings).

### OQ-L2. Where do items spawn at game start?

**Resolved: 8–10 deterministic-by-seed cells from a fixed pool**, scattered in the central 8×7 region of the arena (leaving edges clear). `arena-gen.ts` iterates a sorted candidate list and picks the first 8–10 cells based on `ctx.rng.next() % candidates.length`. Same seed = same scatter.

### OQ-L3. Item interaction model — full set v1

**Resolved (§2 Q9):** click empty = no-op; click weapon/offhand/ring = toggle equip / swap; click potion = drop to floor. Drag-and-drop and consumable use are post-Phase 4.

### OQ-L4. Inventory full when picking up

**Resolved (§2 Q6):** pickup stays on the floor. Player can still walk over it without picking up. Documented in FRICTION.md if it confuses; could surface a "inventory full" HUD line in v2.

### OQ-L5. Equipping a second ring — which slot?

**Resolved (§2 Q9):** prefer empty `ring1`, then `ring2`, then swap with `ring1` (if both full). Documented in `inventory.ts` and tested.

### OQ-L6. Should `stats_c` be snapshotted (derived) or recomputed on restore?

**Resolved (§2 Q10):** snapshot it. Recompute requires the registry to exist at restore-time; while this is always true (registry is set up by `arena-gen` which is in `startup` stage, which runs before any restore-driven tick), serializing `stats_c` adds 4 numbers to the JSON — negligible. **Cheaper than ordering startup-vs-restore semantics.** Tested by including `stats_c` in `world_hash`.

### OQ-L7. PLAN.md §7 Phase 4 LOC overshoot (3.17×)

**Resolved (§5):** accept; document cause. Same pattern as arena's OQ-A9. **Recommendation: update PLAN.md §7 Phase 4 row to reflect realistic budget post-ship.** Surface as an AGENTS.md proposal (§11).

### OQ-L8. Snapshot mid-replay — can replay-player and restore-target share state?

**Resolved (§6):** no. The mid-replay snap+restore test creates a separate world for the restored copy, advances both worlds in parallel through remaining replay events, and compares world hash at end. This is what makes the test load-bearing: it proves restore is a true copy of game state, not just JSON equality.

### OQ-L9. Should the inventory UI overlay scale with viewport, or stay at fixed device-pixel size?

**Resolved (§2 Q4):** scale with viewport. `inventory_ui_container.scale.set(vp.scale, vp.scale)` each frame. Slot rects are in design space (16×16 cells); 4×3 grid is 80×60 design pixels centred — visible at all integer scales.

### OQ-L10. Should we test the DOM `pointerdown` path itself, or only the hit-test math?

**Resolved (§2 Q5 + Phase 4.4):** hit-test math only. The DOM path is browser-only and untested in `bun test`. Replay-driven equip events use the synthetic `slot_click_N` actions instead. **Trade-off:** a regression in DOM pointer plumbing would only surface at visual smoke time. Mitigation: debug fixture (Phase 4.6) auto-runs equip on a real browser via the synthetic-click path, so the manual visual smoke catches DOM regressions.

---

## 8.5. Deviations from plan

Corrections made during implementation. The body of this plan above has been edited in place to reflect the corrected design; this section is the change log so future readers can see what shifted.

- **§2 Q3 / §3 — `inventory_ui_r.dirty_stats` materialised in Phase 4.0, not 4.2.** The flag was added to `resources.ts` during scaffold so downstream stats / equipment systems could write it without re-touching resources. World-hash projections explicitly exclude it (it's a one-tick transient between `equipment_system` and `stats_recompute_system`; including it in the hash would tie hash equality to a transient phase position). See `src/snapshot.ts` and `test/replay.test.ts`.
- **§2 Q5 / §3 — `inventory_ui_r.pending_click_idx` never materialised.** Plan §2 Q5 sketched `inventory_ui_r.pending_click_idx` as a one-tick transient pushed by the DOM handler and consumed by `inventory_system`. Shipped shape is a **closure-local FIFO** inside `make_inventory_system(): { system, queue_click }`. Both the DOM `pointerdown` handler and the `synthetic_slot_click_system` call `queue_click(idx)`; the system drains the closure queue each tick. The queue lives in a factory closure precisely so it does NOT survive snapshot/restore (which would otherwise replay clicks that already fired). See `src/systems/inventory.ts` and `src/main.ts:120`.
- **§2 Q10 — `item_registry_r` typed as `Map<string, unknown>`, not `ItemRegistry`.** Phase 4.0 declared the resource with loose `unknown` payload to avoid an import cycle between `resources.ts` and `data/items.ts`. Tightening would touch every system that reads the registry (`stats.ts`, `inventory.ts`, `main.ts`, `arena-gen.ts`, `inventory-ui.ts`) plus the test fixtures. Working pragma: cast at consumption points (e.g. `stats.ts:49`, `main.ts:86`). Documented in FRICTION.md.
- **§3 — `dir_c` component added in Phase 4.3.** Scaffold (Phase 4.0) didn't anticipate it; cell-step input pattern from bestiary buffers the most recent move direction in a component (so `movement_system` can read it next tick after `input_system` writes it). Added when wiring movement.
- **§2 Q10 — `inventory_ui_r` Zod schema uses `.default(false)` on `dirty_stats`.** Snapshots taken before the field existed (none in production, but a defensive measure) survive restore via the Zod default. Documented in `data/schemas.ts`.
- **§6 — world-hash projection requires canonical-stringify.** Plan §6 sketched `JSON.stringify({ ... })` directly. In implementation: Zod `safeParse(value).data` normalises object key order to schema declaration order, which differs from the projection's construction order. Two byte-identical worlds produced different hash strings until the projection was wrapped in a canonical-stringify (sort keys at every depth). Surfaced in Phase 4.5 replay test. See `test/replay.test.ts:canonical_stringify`.
- **§5 — `item_registry_r` is NOT in the snapshot surface.** Plan §2 Q10 listed it correctly as not registered (static config). The shipped invariant is stricter: restore targets MUST run their boot tick (which calls `setup_arena` and rehydrates the registry) BEFORE the snapshotter calls `restore` — otherwise the next `startup`-stage tick clobbers the restored entities. Documented via the `make_restore_target()` helper in Phase 4.5 and called out in FRICTION.md.

---

## 9. Risks

### R1 — Snapshot schema drift between game code and Zod schema

`data/schemas.ts` is the source of truth for runtime validation; `components.ts` types are the source of truth for compile-time. Drift between the two manifests as a silent snapshot validation pass with wrong shape, or a noisy failure mid-replay.

**Mitigation:** derive component TS types from the Zod schemas via `z.infer<typeof inventory_schema>` rather than handwriting both. Document in PROPOSED-AGENTS-UPDATES.md as a convention for any future snapshotted subsystem.

### R2 — Inventory UI hit-test math wrong at integer scales

Design-space slot rects + window-space pointer events + viewport scale: easy to drift. If `event_to_world` math is misapplied (using world coords for `app.render.world` when overlay is on `app.stage`), clicks land in the wrong slots.

**Mitigation:** Phase 4.4 ships `test/inventory-ui.test.ts` covering the pure math. Phase 4.6 debug fixture auto-clicks for visual confirmation. If a regression slips, FRICTION.md logs it.

### R3 — Pickup-on-cell collision after drop

Two pickups land on the same cell because of drop-to-floor while another pickup already exists. Pickups silently overlap; one is invisible.

**Mitigation:** drop-to-floor scans adjacent cells and only drops on the first open one. If no adjacent open cell exists (player surrounded by pickups), the drop is rejected and a console.warn fires. Tested in `pickups.test.ts`.

### R4 — Inventory state survives a restart that shouldn't carry it

R-key restart calls `world.clear()` + re-runs `arena-gen.ts`. If `inventory_ui_r` isn't reset (e.g. `open: true` stays true post-restart), the modal sticks open with stale data.

**Mitigation:** `restart.ts` explicitly resets `inventory_ui_r.open = false; selected = null` before re-spawn. Tested in `restart.test.ts` (which we'd add if it bites; not in the initial test budget).

### R5 — Replay click recording fragility

The `slot_click_N` action-binding trick is clever but non-obvious. A future agent might "simplify" by using mouse coords directly (and break replay).

**Mitigation:** Document in PROPOSED-AGENTS-UPDATES.md §3 (new): "synthetic click bindings for replay-recordable UI". FRICTION.md captures the friction if a future coder gets confused.

### R6 — Forge `event_to_world` assumes target = `app.render.world`

`event_to_world` calls `cam.screen_to_world`, which assumes the receiving container is `app.render.world` (or shares its design-coord system). The inventory overlay on `app.stage` shares the design coord system *only because we mirror surface_sprite's scale + offset on it*. If a future forge change repositions the overlay sources, this breaks silently.

**Mitigation:** comment in `inventory-ui.ts` explaining the assumption. Could surface as a forge change request post-loot: `event_to_overlay(e, canvas, cam, overlay_container)` that maps DOM → design coords for arbitrary `app.stage` siblings.

### R7 — Snapshot byte-stability sensitivity to JSON key order

`JSON.stringify` walks own-enumerable string keys in insertion order. `snapshotter.take` outputs `entities` sorted by id, but each entity's `components` object is built by walking the `components_by_name` Map. If snapshotter registration order varies between two runs of `make_loot_snapshotter`, the resulting JSON byte-shifts.

**Mitigation:** `make_loot_snapshotter` is a single function with fixed registration order; never construct it twice with different chains. Test asserts two consecutive snapshots of the same world produce byte-identical JSON.

### R8 — LOC overshoot becomes a planning failure mode

Two subsystems in a row (arena 2.6×, loot projected 3.17×) overshooting PLAN.md §7 budgets is a pattern, not noise. PLAN.md §9 R1 already flags scope creep; if every subsystem 2–3×s its budget, the Phase 8 integration estimate also under-counts.

**Mitigation:** AGENTS.md proposal (§11): future PLAN.md §7 budgets explicitly include tests + debug fixture as separate LOC line items, not folded into "replay test ~60". Re-baseline using arena + loot actuals.

---

## 10. Phase task summary (for devpad mirror)

devpad MCP tools were not available in the prior session and assumed not available here per the user instruction. The user mirrors these manually, or a future session with devpad access runs `devpad_tasks_upsert` against the structure below. Each row maps to one devpad task with `tag: "loot"`, `project: echo`.

| Phase | Sub-task | Owner agent | Depends on |
|---|---|---|---|
| 4.0 | scaffold (`package.json`, components, resources, bindings, fixtures) | coder | — |
| 4.1 | items registry + Zod schemas | coder | 4.0 |
| 4.2 | inventory + equipment + stats systems + unit tests | coder | 4.1 |
| 4.3 | pickups + arena-gen + movement + tween + restart + plugin wiring | coder | 4.2 |
| 4.4 | inventory UI overlay + stat-panel HUD + hit-test unit tests | coder | 4.3 |
| 4.5 | replay-as-test + snapshot mid-replay round-trip test | coder | 4.4 |
| 4.6 | debug fixture entry + auto-script + build script wiring | coder | 4.5 |
| 4.7 | FRICTION.md + PLAN.md promotion + PROPOSED-AGENTS-UPDATES.md + README link | coder | 4.6 |

**Task counts:** 8 sequential single-coder tasks, 0 parallel `coder-fast` tasks (deliberate per arena FRICTION.md §6 + §13). 0 verification-coder phases needed beyond each phase's commit (single coder commits inline).

---

## 11. Suggested AGENTS.md updates

Propose these for `~/dev/echo/AGENTS.md` after loot ships, pending user approval. **Never write to AGENTS.md without confirmation.** Several stack on top of arena's PROPOSED-AGENTS-UPDATES.md (un-merged at time of this plan).

### Stacks-on-top-of arena's un-merged proposals

These items in arena's `PROPOSED-AGENTS-UPDATES.md` matter for loot specifically:
- **§3 (continuous-motion vs cell-step).** Loot is the post-arena cell-step proof point. Merging this rule before loot ships would help; if it merges after loot, loot strengthens the case (2 cell-step + 1 continuous in echo so far).
- **§6 (`debug.html` references `./main.js`).** Loot's Phase 4.6 hits the same scaffold trap unless this lands. **Recommend merging before loot Phase 4.6.**
- **§7 (bun test timeout 5s default).** Loot's replay (with mid-replay snap+restore) will be longer than arena's (which trips the default). Recommend merging.

The remaining arena items (§1, §2, §4, §5) are arena-specific (hitstop, hit-event consumers, camera shake, lighting filter) and don't bind on loot.

### New conventions surfaced by loot

1. **Snapshotter ownership is per-subsystem; build it as a factory function.** Every snapshotted subsystem ships a `make_<sub>_snapshotter()` factory in `data/schemas.ts` (or equivalent) that registers components + resources in a fixed order. Both `main.ts` and replay tests call it. Never construct ad-hoc `snapshotter()` chains inline; differing registration orders break byte-stability.

2. **Derive component types from Zod schemas, not the inverse.** For snapshotted subsystems: define `pickup_schema = z.object(...)`; export `type Pickup = z.infer<typeof pickup_schema>`; `component<Pickup>("lt.pickup")`. Single source of truth, no drift.

3. **Synthetic action bindings for replay-recordable UI.** Mouse / pointer events are not in the replay schema. UI interactions that must be replay-recordable are wired as digital action bindings (e.g. `slot_click_0..11`) bound to unused keys. The recorder emits them; the replay-player consumes them. The browser never fires them.

4. **Game-side UI overlays install on `app.stage` as siblings of `surface_sprite`, not inside `app.render.world` or `app.render.debug_overlay`.** Both `world` (gets lighting filter) and `debug_overlay` (semantically for debug HUDs) are wrong for primary game UI. Add an explicit sibling Container; mirror `surface_sprite`'s scale + offset each frame so design-space layout works. `event_to_world` works for hit-testing because the design-coord system is identical.

5. **PLAN.md §7 LOC budgets understate by ~2.5–3× because they don't size tests + debug fixture.** Future subsystem rows in PLAN.md §7 should list "core code ~X LOC; tests ~Y LOC; debug fixture ~Z LOC" as separate columns. Re-baseline using arena + loot actuals.

6. **Cell-step + continuous-motion subsystems are distinct architectural choices that must be picked at scaffold time.** Adding this to the AGENTS.md "Rendering conventions" section finalises the convention surfaced by arena's PROPOSED-AGENTS-UPDATES.md §3.

---

## 12. Reference paths

| Topic | Path |
|---|---|
| Subsystem package shape (canonical) | `~/dev/echo/subsystems/arena/package.json` |
| Subsystem plugin pattern | `~/dev/echo/subsystems/arena/src/plugin.ts` |
| Cell-step movement + tween pattern | `~/dev/echo/subsystems/bestiary/src/systems/movement.ts` + `tween.ts` |
| Replay-as-test pattern | `~/dev/echo/subsystems/arena/test/replay.test.ts` |
| Recording tool pattern | `~/dev/echo/subsystems/arena/tools/record-wave-clear.ts` |
| Debug fixture pattern | `~/dev/echo/subsystems/arena/src/main-debug.ts` + `debug-plugin.ts` |
| Debug overlay HUD pattern | `~/dev/echo/subsystems/arena/src/systems/debug-overlay.ts` |
| Forge snapshot API | `~/dev/forge/src/snapshot.ts` |
| Forge snapshot tests (canonical usage) | `~/dev/forge/test/storage/snapshot.test.ts` |
| Forge `event_to_world` | `~/dev/forge/src/pixi/coords.ts:26-39` |
| Forge boot wiring | `~/dev/forge/src/pixi/index.ts` |
| Wall-debug DOM pointerdown pattern (for inventory click handler) | `~/dev/echo/subsystems/dungeon-walk/src/systems/wall-debug.ts:84-110` |
| Rendering conventions (non-negotiable) | `~/dev/echo/AGENTS.md` ("Rendering conventions") |
| Forge API gotchas (non-negotiable) | `~/dev/echo/AGENTS.md` ("Forge API gotchas") |
