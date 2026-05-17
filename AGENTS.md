@~/.claude/AGENTS.md

# echo — agent notes

`echo` is an infinite dungeon crawler built on `@f0rbit/forge`. The repo is a bun-workspaces monorepo of seven small playable subsystems (`subsystems/<name>/`) plus a composed final game (`main/`) and a static landing site (`hub/`). See [`PLAN.md`](./PLAN.md) for the full scoping document.

## PLAN.md §7 LOC budgets understate by ~3×

Empirical: arena landed at 2.6× of an 810 budget; loot at 3.17× of an 890 budget (2.25× excluding tests + debug fixture). PLAN.md §7 doesn't size tests + debug fixtures as separate columns, and collapses "X system" rows that ship as 2–3 separate testable systems. From phase-5 (`progress`) onwards, apply a 2.5–3× multiplier when reading the budgets, or break each phase into "core code / tests / debug fixture" columns before planning. This is a planning failure mode, not noise. See `subsystems/arena/PLAN.md` §5 and `subsystems/loot/PLAN.md` §5 phase totals.

## Pre-scaffold checklist — enumerate stat-modifier fields before `components.ts`

Before writing `components.ts` for a new subsystem, read every system file in §5 of the plan and enumerate every stat / state-modifier field referenced. Progress's `xp_gain_mul` perk needs `stats_c.xp_gain_mul`; the Phase 5.0 scaffold missed it and Phase 5.2 had to amend `components.ts` mid-system-implementation. Trivially preventable with a pre-read pass. See progress FRICTION.md §3.

## Repo layout

```
echo/
├── hub/                   # Astro static landing — deployed at /echo/
├── subsystems/<name>/     # bun-bundled mini-games — deployed at /echo/<name>/
├── main/                  # composed game — deployed at /echo/main/ (Phase 8)
└── .github/workflows/pages.yml
```

## URL convention (flat)

- Hub: `https://f0rbit.github.io/echo/`
- Subsystems: `https://f0rbit.github.io/echo/<name>/` — flat, no `subsystems/` segment in the URL
- Source layout still uses `subsystems/<name>/` for organisation; the deploy step aggregates `subsystems/<name>/dist/` to `_site/<name>/`

## Static-only — no SSR

GitHub Pages can't run server functions. Astro is configured `output: "static"`. Subsystems use `bun build --target browser` and ship a static `index.html` + `dist/main.js`.

## Per-subsystem pattern

Mirror `~/dev/coin-collector/` exactly: `bun build src/main.ts --outdir dist --target browser`, dependencies on `@f0rbit/forge` from npm (never via workspace symlink), `pixi.js`, `@f0rbit/corpus`, `zod`. Each subsystem owns its own `index.html`, `tsconfig.json`, `replays/`, and `test/`. See `PLAN.md` §3 for canonical shape.

## No `@echo/shared`

Subsystems never import from each other or from a shared sibling package. Duplication is the signal that something belongs in forge — not in a sidecar package. See `PLAN.md` §5 for the forge promotion criteria (2+ subsystems duplicating a helper → propose forge promotion).

### Convention for duplicating bestiary's chaser AI

When copying bestiary's cell-step chaser AI to a new subsystem:

- **Add the `<sub>_r.paused` early-return gate** at the top of each copied system. Bestiary doesn't pause; downstream subsystems do. Forget the gate and chasers chase through the level-up pause.
- **Annotate every copied file with a `// FORGE-PROMOTION-CANDIDATE` header** listing all known consumers and the planned promotion phase (currently Phase 8 `main`). Promotion-candidate density on a file is the signal future agents look for.
- **Component-shape divergences** (e.g. `state_c { kind, aggro_radius }` in bestiary vs. `state_c { kind }` in progress) resolve via **module constants** in the consumer — not by widening the shared shape. Only the third consumer forces a generalised shape; until then, copies diverge locally.

Three copies exist as of progress (bestiary, progress; boss-to-come is the fourth). See progress FRICTION.md §1.

## `main` not yet a workspace

`main/` is not in `workspaces` until Phase 8 — bun rejects an empty workspace directory at install time. When Phase 8 starts and `main/package.json` exists, add `"main"` back to the root `workspaces` array. The `main:build` and Pages-deploy steps already detect `main/package.json` and skip gracefully when absent.

## Build / test / deploy

- `bun run hub:dev` — run the hub landing locally (`localhost:4321/echo/`)
- `bun run build:all` — build hub + every subsystem + main (no-ops gracefully when subsystems/main are empty)
- `bun test` — runs every subsystem's replay-as-test fixture from the root
- Push to `main` triggers `.github/workflows/pages.yml` which builds, aggregates to `_site/` (flat), and deploys to GitHub Pages

### Replay-as-test timeouts

`bun test` defaults to a 5 s per-test timeout. Replay-driven tests run the full recorded fixture (e.g. arena's `wave-clear.replay.json` is 2812 frames ≈ 30 s of fixed-dt simulation in the harness), which trips the default with a useless abort. Pass the timeout as the third arg to `test()`:

```ts
const REPLAY_TIMEOUT_MS = 30000;
test("wave_r.total_kills === 15", () => { /* ... */ }, REPLAY_TIMEOUT_MS);
```

See `subsystems/arena/test/replay.test.ts` and arena FRICTION.md §7.

### `harness.tick()` only runs the `update` stage

The bun test harness's `tick()` method runs only the `update` stage — `startup`, `pre`, `post`, and `render` are skipped. Tests that need world state pre-seeded must set resources + spawn entities directly (e.g. `ctx.res.set(item_registry_r, make_test_registry())`) rather than relying on `startup`-stage systems to do it. This bites every time a new subsystem writes its first test fixture. Document the seed helpers in `test/fixtures/<sub>-scenario.ts`. See `subsystems/loot/test/fixtures/loot-scenario.ts` and loot FRICTION.md §11.

## Forge promotion gates

Subsystems may sit on different `@f0rbit/forge` minors during development; Phase 8 aligns everything to the latest forge minor and re-records any drifted replay fixtures. See `PLAN.md` §5 for the per-phase forge bump table.

## Rendering conventions

Three patterns that have repeatedly tripped up consumers — bake them in once:

### Canvas → world coords

Use `event_to_world(e, canvas, app.camera)` from `@f0rbit/forge/pixi` for DOM pointer events. It handles `getBoundingClientRect` + CSS-pixel-to-canvas-buffer DPR scaling + forge's two-stage RenderTexture pipeline. **Never reimplement `fit_scale` math** — forge's `Container.worldTransform` reports identity for `app.render.world` because the actual scale lives on the offscreen-composited `surface_sprite` on `app.stage`, which is invisible to `toLocal`.

### Cell coordinates are CENTER, not top-left

`g.cell_to_world(cx, cy)` returns `{ cx*tile + tile/2, cy*tile + tile/2 }`. So `pos_c` for any cell-aligned entity (floors, walls, mobs) is already the cell center. Sprites with `anchor: { x: 0.5, y: 0.5 }` render correctly with NO additional offset. **Don't add `+ g.tile / 2` to coords retrieved from `pos_c`** — that bug bit `wall-debug.ts` and `debug-overlay.ts` independently; both fixed.

### Unfiltered overlay container

`app.render.debug_overlay` (Container) sits OUTSIDE the lighting filter — children render at full brightness regardless of the player's eye-light reach. Use it for HUD, debug markers, FOV circles, click visualizations. Children of `app.render.world` get the lighting treatment (which darkens them in unseen areas).

### Game UI overlays — `app.stage` sibling, mirror `surface_sprite`

Primary game UI (inventory modal, dialogue panel, perk-choice overlay) goes on `app.stage` as a **sibling of `surface_sprite`**, NOT inside `app.render.world` (which gets the lighting filter), NOT on `app.render.debug_overlay` (semantically reserved for debug HUDs).

The overlay container must manually mirror `surface_sprite.scale.x` and `surface_sprite.position.{x,y}` so design-space layout works. Apply the mirror **once at boot** AND **on every `app.render.resize()` callback** — NOT per-tick (wasted work for state that changes only on resize).

`event_to_world` works for hit-testing because the overlay shares `surface_sprite`'s design-coord system once mirrored. See `subsystems/loot/src/main.ts` and loot FRICTION.md §5.

### Sibling z-order in `app.stage` — `addChildAt(idx)`, not `addChild`

Forge's built-in `app.stage` children render bottom-to-top in this order: `surface_sprite`, `debug_overlay`, `palette_overlay`. To insert a new sibling deterministically between them:

```ts
const idx = app.app.stage.getChildIndex(palette_overlay);
app.app.stage.addChildAt(my_overlay, idx);
```

Plain `app.app.stage.addChild(my_overlay)` always appends at the top — wrong if you want the modal below the palette overlay. Note `app.app.stage` (the underlying Pixi `Application.stage`) vs `app.stage` (a re-export convenience). See `subsystems/loot/src/main.ts:120` and loot FRICTION.md §6.

### Wall sprites + autotile

`subsystems/<sub>/src/systems/wall-autotile.ts` (byte-identical between bestiary + dungeon-walk) implements **Godot 3x3 minimal autotile** against the 0x72 `atlas_walls_low-16x16.png` sheet, which was designed for exactly this algorithm. Don't go back to 4-bit bitmask — the resulting corner / T-junction tiles don't visually connect because 0x72's named frames (`wall_mid`, `wall_top_left`, etc.) were designed for hand-placed 16×32 layered rendering, not for a 16-tile bitmask grid.

The algorithm: 8-direction neighbor sample → per-corner state (OUTER/SIDE_A/SIDE_B/CONCAVE/FILLED) → 47-entry lookup → tile (col, row). Diagonal-gating rule: a diagonal neighbor only matters when both its adjacent cardinals are also walls (collapses 256 raw 8-neighbour patterns onto 47 unique tiles). Snapshot tests in `test/wall-autotile.test.ts` + `test/fixtures/pattern-to-tile.json` regression-guard the mapping.

If we ever switch sprite packs: the new pack's wall sheet must be authored to Godot 3x3 minimal (or supply a custom lookup table conforming to the same corner-state interface). Other autotile conventions (RPG Maker XP, Wang/blob) need different lookups.

### Walls render on top of floors via explicit z-order

Wall sprite frames have transparent edges (especially side/edge pieces — designed to show floor through them). So every cell — wall AND floor — gets a floor entity (giving it a floor sprite). Walls get an additional `wall_c` entity, which gets a wall sprite on top via autotile. Z-ordering: `sprite_c.z` = 1 (floor) / 2 (wall, exit) / 3 (player, mobs); `world.sortableChildren = true`. Insertion order is unstable because `wall_autotile_system` runs at startup but `sprite_attach_system` runs every post-stage tick — explicit z is the only reliable solution.

### Continuous motion vs. cell-step

Cell-step subsystems (`bestiary`, `dungeon-walk`) integrate via `g.move_tile` and use `pos_c` (snapped) + `visual_pos_c` (lerped) + `tween_step_system` to hide the cell jumps. Continuous-motion subsystems (`arena`) integrate `vel_c { vx, vy }` into `pos_c` directly each tick — there is no `visual_pos_c` and the tween system is omitted. `dir_vec_c` is repurposed as **facing persistence**: only updated on non-zero input, so a stationary player still has a heading for melee/ranged direction.

Do not mix the two models in one subsystem. Pick one at scaffold time. See `subsystems/arena/src/systems/movement.ts` and arena FRICTION.md §8.

#### `dir_c` write convention diverges by ability shape

Within cell-step subsystems there are two `dir_c` patterns — pick at scaffold time based on whether the subsystem ships a directional ability:

- **Loot pattern** (no melee): write `{dx, dy}` every tick — `{0, 0}` when no input. `dir_c` is just last-input.
- **Progress pattern** (cell-step + melee): write `dir_c` **only on nonzero input**. A stationary player retains their last heading so the `Z` swing has a direction. **Critical for melee subsystems** — without persistence, the swing fires in `{0, 0}` direction and hits nothing.

Document the choice in the subsystem's local notes. See progress FRICTION.md §4.

### Debug fixture pattern

For any visual system that's non-trivial (autotiling, lighting, particles, post-processing), ship a `subsystems/<sub>/debug/` companion page alongside the playable one. Pattern (see `dungeon-walk/src/main-debug.ts` + `dungeon-walk/src/debug-plugin.ts` + `dungeon-walk/src/systems/debug-arena-gen.ts`):

- Separate `<page>-debug.ts` entry point (own boot)
- Stripped plugin — no input/AI/lighting/movement — just the visual systems under test
- Hand-crafted arena that deterministically exercises every code path (e.g. all 47 autotile corner-state combos in one layout)
- Auto-enable debug toggles at boot (`echoWallDebug(true)`, etc.)
- Build script: `bun build src/main-debug.ts --outdir dist/debug` + copy `public/*` to `dist/debug/`
- Deployed at `/echo/<sub>/debug/`

Visual fixtures unlock fast iteration (and let agents verify autonomously via Chrome DevTools screenshots) without procedural-dungeon noise + lighting interference.

#### Debug build pipeline rename

`bun build src/main-debug.ts --outdir dist/debug` emits `dist/debug/main-debug.js`. The build script then `mv`s it to `dist/debug/main.js` so the deployed `dist/debug/index.html` can ship a clean `<script src="./main.js">`. The `debug.html` source in the subsystem root must reference `./main.js`, NOT `./main-debug.js` — the rename happens at build time. Scaffold defaults that ship `./main-debug.js` will 404 in the deployed page. See `subsystems/arena/package.json` build script and arena FRICTION.md §9.

## Forge API gotchas

Four traps that bit three separate parallel coders during arena Phase 3.2 — internalise them before touching forge ECS code:

### Marker components are elided from query tuples

`query([pos_c, hitbox_c, chaser_c]).collect()` yields `[Id, Pos, Hitbox]` tuples — three slots, NOT four. `chaser_c: Component<true>` is a marker (no payload), so forge drops it from the result shape. Same for any `Component<true>`. Destructure to the data-carrying components only.

### `world.despawn(id)`, not `world.delete(id)`

Removal is `despawn`. There is no `delete` method on `World`.

### `world.despawn` returns `Result<void, EngineError>`

`world.despawn(id)` returns `Result<void, EngineError>`, not `void`. Most call sites can ignore it (a just-queried `Id` cannot error on despawn), but strict-result-handling consumers (corpus pipe chains, lint-enforced `.ok` checks) must handle it explicitly. Pattern:

```ts
// safe-to-ignore call site (e.g. /kill-all palette command):
for (const [id] of world.query([chaser_c]).collect()) void world.despawn(id);

// strict-handling site (rare):
const r = world.despawn(id);
if (!r.ok) return err(r.error);
```

See progress FRICTION.md §11.

### Resources live on `ctx.res`, not `world.res`

Startup systems that read or initialise resources need the `ctx` parameter — `world` on its own has no `res` accessor. Signature: `(world, ctx) => { ctx.res.get(foo_r) }`.

### `world.spawn(...)` is variadic over `[Component, value]` tuples

Spawn as `world.spawn([pos_c, p], [vel_c, v])` — pass each component-value pair as a separate argument. Do NOT wrap the pairs in an outer array (`world.spawn([[pos_c, p], [vel_c, v]])` is wrong and will silently spawn an empty entity).

## Architecture patterns

### Game-state gates, NOT `time.scale = 0`

Do NOT model frame-pauses (hitstop, level-up pause, dialogue freeze) as `ctx.time.scale = 0`. `time.advance(real_dt, each)` increments the accumulator by `real_dt * scale`; with `scale = 0` the accumulator never fills, `sch.tick` never fires, and the `pre`-stage release system that's supposed to restore `scale = 1` never runs. Permanent freeze.

Correct pattern: a gate resource (e.g. `hitstop_r.remaining > 0`, `paused_r.value`) → every gameplay system early-returns. A `pre`-stage release decrements/clears the gate; that release system must NOT gate on itself. `time.scale` stays at `1`. Render-stage systems keep ticking (shake + flash + light-fx continue to decay through the freeze — intentional). Replay determinism is preserved because `time.tick` advances normally. See `subsystems/arena/src/systems/hitstop.ts` and arena FRICTION.md §1 (commit `52ba5b6`).

### Transient state in factory closures, not resources

Anything in the resource bag is contracted into the snapshot surface. Click queues, animation pending-flags, network in-flight requests, DOM event buffers — anything that must NOT survive snapshot/restore — belongs in a factory closure, not a resource.

Pattern: `make_<system>(): { system: System; <imperative_setter>(): void }`. The returned system is registered; the imperative setters are called by DOM handlers / replay bridges / etc. The closure-captured state never enters the snapshot surface. Loot's inventory click queue is the canonical example: `make_inventory_system(): { system, queue_click }`. See `subsystems/loot/src/systems/inventory.ts` and loot FRICTION.md §4.

## Snapshot / persistence

### Snapshot world-hash needs canonical-stringify

Zod's `safeParse(value).data` normalises object key order to schema declaration order, NOT the construction order of the input. If your world-hash projection builds objects in one order and the post-restore copy is rebuilt from snapshot-parsed values, `JSON.stringify` produces byte-different strings for byte-identical state.

Fix: either build the projection with canonical (sorted) key order, OR wrap the projection in a `canonical_stringify` that sorts keys at every depth before stringifying. Loot uses the latter; see `subsystems/loot/test/replay.test.ts:canonical_stringify` and loot FRICTION.md §1.

### `Snapshotter.restore()` is destructive — boot the target first

`restore(w, snap, ...)` calls `w.clear()` as the first step before re-creating entities from the snapshot. **If the restore target hasn't run its boot tick yet, the next `update`-stage tick will fire the startup gate (e.g. `setup_arena`) and clobber the restored entities silently** — no error, just wrong state on the following tick.

Pattern: a `make_restore_target()` helper runs the boot tick first (which sets the `startup_done` resource flag and rehydrates any startup-only state), THEN passes the harness to `snapper.restore`. See `subsystems/loot/test/replay.test.ts:make_restore_target` and loot FRICTION.md §2.

### Static config does NOT go in the snapshot

Resources containing static lookup data (item registries, behaviour tables, sprite-frame name maps) should NOT be registered with the snapshotter. They rehydrate via the same startup-stage system that ran originally (e.g. `setup_<sub>`). Document the contract in code with a comment on the resource declaration: `// NOT snapshotted — static config, rehydrated by setup_<sub>`.

This composes with the destructive-restore note above: the restore target's boot tick rehydrates the static config; restore re-populates the dynamic state on top. Loot's `item_registry_r` is the canonical example. See loot FRICTION.md §3.

### Closure-held `ctx.rng.fork()` streams are NOT in the snapshot

`Snapshotter` captures `ctx.rng` state only. Streams produced by `ctx.rng.fork()` and held in factory closures (e.g. `enemy-spawn.ts`'s spawn-RNG, `xp.ts`'s perk-shuffle RNG) **do not survive restore.** Post-restore, a re-fork from the restored `ctx.rng` state starts from the same draw count, but the original closure has advanced past that fork by N draws — so the new fork's stream is offset.

Two fixes:

- **(a) Re-fork every tick** (recommended). `const r = ctx.rng.fork()` inside the system body, not closure-captured. Cheap (single-step splittable hash), deterministic, immune to snapshot drift.
- **(b) Snapshot the forked stream state explicitly** by carrying it on a resource that IS in the snapshot surface. Larger surface area; only if `(a)` is too expensive (rare).

**Symptom if you ignore this:** mid-replay snap-and-restore appears byte-stable for one tick, then diverges several ticks later as the next fork-draw happens at different counts in source vs. restored sim. See progress FRICTION.md §5.

### Disk-save key shared between production and debug fixture is intentional

Progress's debug fixture writes to `echo:progress:save:slot-1` — the same key as the production page. Intentional: running the debug fixture then reloading the production page surfaces the restored state visually, with zero manual input needed.

Consequence: debug fixture is destructive to any prior production save in the same browser profile. **Surface this in the subsystem's FRICTION.md** so a user who plays a real run then runs the debug fixture knows their save was overwritten. See progress FRICTION.md §13.

## Input

### Synthetic action bindings for replay-recordable UI clicks

DOM `pointerdown` does NOT flow through forge's bindings layer, so it is not in the replay stream. To make UI clicks replay-deterministic, wire each UI action as a digital action binding on a reserved key (e.g. `slot_click_0..11` bound to `F1..F12`). Real users never press these. The recorder emits them when the DOM handler fires; the replay-player consumes them via a tiny bridge system that calls the same imperative setter (e.g. `queue_click`) as the real DOM handler.

This avoids extending the replay schema. Leave a comment in `bindings.ts` explaining why `F1..F12` exist. See `subsystems/loot/src/bindings.ts` + `subsystems/loot/src/systems/synthetic-slot-click.ts` and loot FRICTION.md §7.

## Forge promotion candidates (deferred)

Tracker for helpers / systems duplicated across subsystems that meet the `PLAN.md` §5 promotion gate (2+ consumers). Boss / hub / main planning should consult this list before scaffolding.

| Candidate | Current consumers | Imminent consumer | Recommended promotion phase | Target path |
|-----------|-------------------|--------------------|-----------------------------|-------------|
| `localstorage_store()` (browser persistence backend mirroring corpus `create_file_backend`) | progress | hub (Phase 7 — settings, run-list, recent-saves) | end of Phase 7, forge v0.4.x patch | `forge/src/storage/` |
| `compose_modifiers()` (additive + multiplicative stat composition over a sources list) | loot, progress | main (Phase 8 composes equipment + perks against the same `Stats` shape) | Phase 8 `main` | `forge/src/composition/modifiers.ts` |
| A* + chaser AI bundle (`astar.ts` + `ai-chaser.ts` + `path-step.ts` + `creature-occupancy.ts`) | bestiary, progress | boss (Phase 6) → three copies by end of Phase 6 | end of Phase 8 `main` (after composition stabilises the shape) | `forge/src/ai/` |

**`compose_modifiers()` signature sketch:**

```ts
compose_modifiers<S, Src>(
  base: S,
  sources: ReadonlyArray<Src>,
  resolve: (s: Src) => StatModifier | undefined,
  rules: { additive: ReadonlyArray<keyof S>; multiplicative: ReadonlyArray<keyof S> },
): S;
```

**A* + chaser surface area:**

- `astar(grid, start, goal, opts): Result<Path, AStarError>` — already pure, no ECS coupling.
- `make_ai_chaser_system({ paused_r, aggro_radius }): System` — factory with paused-resource injection so each subsystem picks its own gate.
- `make_path_step_system({ paused_r, tile_dt }): System` — same shape.
- `creature_occupancy_r` + `make_creature_occupancy_system(): System` — pre-stage occupancy index.

Until promotion, see the "Convention for duplicating bestiary's chaser AI" section above for how copies should diverge locally.
