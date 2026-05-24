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

### Local visual smoke — `bun run serve`

Every subsystem + hub exposes a `serve` script that statically serves its built `dist/` on `http://localhost:4567/` via `tools/serve-dist.ts` (~50 LOC, native `Bun.serve()`, no extra deps). Workflow:

```sh
cd subsystems/<sub> && bun run build && bun run serve
# or from the repo root:
bun run serve:<sub>     # e.g. serve:progress, serve:arena, serve:hub
```

Root has `serve:hub`, `serve:arena`, `serve:bestiary`, `serve:dungeon-walk`, `serve:loot`, `serve:progress`. Pick a free port via `bun ../../tools/serve-dist.ts dist <port>` if 4567 is taken. This is the canonical path for any non-sandboxed verification coder to self-smoke a production build (vs. `bun run dev`, which is for source-watching). See progress FRICTION.md §22 for why `bunx serve` + `python3 -m http.server` were rejected as sandbox-blocked alternatives.

### Forge debug surface — `window.__forge` + `app.screenshot()` + palette MCP recipes

Every subsystem boots forge v0.5.4+ with `debug: is_dev()` and an `app_id: "<subsystem>"` (debug fixtures hard-code `debug: true`). When the debug surface is on, forge attaches `window.__forge = { app, world, res, schedule, time, rng, palette, screenshot }` and registers a set of builtin palette commands (`/screenshot`, `/dump-state`, `/pause`, `/resume`, `/step [n]`, `/slowmo <f>`, `/normal`). `App.screenshot()` is always callable — it just no-ops to an empty `Blob` when `debug: false`.

`is_dev()` lives at `@f0rbit/forge/debug` and auto-detects via `__DEV__` global + `NODE_ENV`. Don't roll your own dev/prod guard — defer to forge so the dev/prod policy stays in one place.

Chrome-DevTools-MCP recipes (preferred over synthetic-keyboard / `canvas.toDataURL()` workarounds — see progress FRICTION.md §22):

```js
// pretty-printed world + resources dump (returns a string ready for read-back)
await window.__forge.palette.run("dump-state")

// imperative screenshot — returns a Blob extracted from the live Pixi canvas
await window.__forge.app.screenshot()

// step exactly N ticks while paused (deterministic frame-by-frame stepping)
await window.__forge.palette.run("pause")
await window.__forge.palette.run("step 5")
await window.__forge.palette.run("resume")
```

`__forge.palette.run(line)` returns a `Promise<string>` (the line of output the palette would have printed), so a verification coder can `evaluate_script` the call and read the textual reply back through DevTools console — no DOM event synthesis needed. Use `app_id` to disambiguate when more than one debug-enabled tab is open in the same browser profile (forge namespaces `__forge` per app id internally).

### `bunx serve` (and stale ports generally) silently reuse the previous process — verify with `curl`

Any static server (`bunx serve`, `python -m http.server`, our `serve-dist.ts`) bound to an already-occupied port will silently fall through to the **previous process** serving that port — Chrome DevTools then screenshots stale content, which the agent reads as "the change didn't apply".

Before trusting a visual screenshot, verify the live response:

```sh
curl -s http://localhost:<port>/ | head -5
```

Confirm the response matches the current `dist/index.html`. If it doesn't, kill stale processes (`lsof -i :<port>` → `kill -9 <pid>`) and re-serve. Bit phase 5.9.3 (progress visual smoke). Trivially preventable.

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

### Crisp text — `resolution: 4` per-Text, `scale: 0.5` when container scales

All `pixi.Text` constructors get `resolution: 4`. The follow-up `text.scale.set(0.5)` depends on the parent container:

| Parent | `resolution` | `text.scale.set(...)` |
|--------|--------------|------------------------|
| `app.render.world` (lighting-filtered) | 4 | 0.5 |
| `app.render.debug_overlay` (canvas-pixel space) | 4 | — (no scale) |
| `app.stage` modal mirroring `surface_sprite` (loot inventory, progress perks, arena shell screens) | 4 | 0.5 |

The 4× super-sample renders the glyph cache at higher DPI; the 0.5 scale takes the displayed Text back to design-space dimensions. **Net effective on-screen DPI: 2× the design canvas.** Without this, Pixi v8 samples the cached glyph texture inappropriately when the container scales > 1 — text looks aliased + blurry.

Practical consequence for modal text (any place `scale.set(0.5)` is in play): **double the stored `fontSize` and `wordWrapWidth`** so the visible size + wrap behaviour match the original design. E.g. a design-space 8 px label with `wordWrapWidth: 78` becomes `fontSize: 16` + `wordWrapWidth: 156` after the recipe; on-screen result is 8 px visible at 4× DPI cache.

Established by commit `f1614a6` (bestiary wall-debug) for `app.render.world`; extended to `app.stage` modal overlays by arena shell screens (Phase 5.9.4); swept across loot HUDs + progress HUDs + arena debug overlay in Phase 5.9.5.

### 9-sliced game UI panels + buttons — `NineSliceSprite` + Kenney pack

Game UI (modals, panels, buttons) uses Pixi v8's `NineSliceSprite` against Kenney-style asset packs (CC0 9-slice PNGs). Convention:

- **Raw PNGs, no atlas.** Until a subsystem has ≥12 distinct UI assets the atlas-packing overhead isn't justified — `NineSliceSprite` accepts a `Texture` directly. The dungeon + walls atlases stay the precedent for ≥40-tile sheets; UI is a different scale.
- **Slice insets as module-level constants** in the wrapper file (`DEFAULT_PANEL_INSETS = { left: 8, top: 8, right: 8, bottom: 8 }` for Kenney's 48×48 borders). Document the source filename in a header comment — a future asset swap forces a fresh visual-inspection pass + its own constants.
- **Asset loading — Option B (pre-boot `Assets.load`).** Wire UI texture URLs into a helper like `subsystems/<sub>/src/ui/assets.ts:load_ui_assets()` and `await` it BEFORE forge's `boot()`. Lazy `Texture.from()` inside the wrappers risks a blank first frame on slow connections — visible flicker exactly when the modal pops. Pixi's `Assets` cache is process-global so later `Texture.from(url)` lookups stay synchronous once loaded.
- **Modal placement.** Per existing "Game UI overlays — `app.stage` sibling, mirror `surface_sprite`" recipe. NineSlice modals go on `app.stage`, NOT `app.render.world` (lighting filter would darken them in unseen areas).
- **Folder hygiene.** Kenney's pack ships subfolders with spaces — rename to kebab-case on disk so URLs are clean (`transparent-border/` not `Transparent%20border/`) per the repo's kebab-case filename convention.

First consumer: progress's perk-choice modal. See `subsystems/progress/src/ui/{assets,panel,button}.ts` for the canonical shapes and `subsystems/progress/FRICTION.md` §17–§19.

### Tiled floors + perimeter walls — every subsystem

All subsystems with a 20×11 single-room arena render:
- A `floor_c` entity in **every** cell (sprite `floor_1`, z=1).
- A `wall_c` entity in every **perimeter** cell (sprite via `wall_autotile_system` from `@f0rbit/forge/autotile`, z=2).

Game entities (player, enemies, projectiles, pickups) sit at z=3. The 0x72 floor frames have full opaque coverage; the 0x72 wall frames have transparent edges (designed to show floor through them) — hence floor + wall **co-spawn at the same perimeter cell**, with explicit z-order resolving stacking.

Spawn reservations (player spawn, pickup placement, enemy spawn) MUST exclude wall cells. Visual walls are **NOT collision-blocking** — existing `g.in_bounds` clamping (arena) or cell-step move guards (loot, progress) prevent the player from leaving the playable area.

Per "No `@echo/shared`" above — `walls-autotile.{png,json}` is **duplicated per subsystem** under `public/`. Forge ships no binaries; duplication is the cost of the per-subsystem-asset rule.

Established as standard in Phase 5.9.0–5.9.3 of the polish pass.

### Debug fixture pattern

For any visual system that's non-trivial (autotiling, lighting, particles, post-processing), ship a `subsystems/<sub>/debug/` companion page alongside the playable one. Pattern (see `dungeon-walk/src/main-debug.ts` + `dungeon-walk/src/debug-plugin.ts` + `dungeon-walk/src/systems/debug-arena-gen.ts`):

- Separate `<page>-debug.ts` entry point (own boot)
- Stripped plugin — no input/AI/lighting/movement — just the visual systems under test
- Hand-crafted arena that deterministically exercises every code path (e.g. all 47 autotile corner-state combos in one layout)
- Auto-enable debug toggles at boot (`echoWallDebug(true)`, etc.)
- Build script: `bun build src/main-debug.ts --outdir dist/debug` + copy `public/*` to `dist/debug/`
- Deployed at `/echo/<sub>/debug/`

Visual fixtures unlock fast iteration (and let agents verify autonomously via Chrome DevTools screenshots) without procedural-dungeon noise + lighting interference.

#### One debug fixture per visual concern

When a subsystem ships multiple debug fixtures, each fixture validates exactly one concern. Don't conflate a UI cookbook with a gameplay-state fixture. Example: progress ships two —

- `/echo/progress/debug/` (`src/main-debug.ts`) — validates the level-up state machine + persistence via choreographed XP grants. Real save/restore round-trip, real perk picks, no UI variation exercised.
- `/echo/progress/debug-gui/` (`src/main-debug-gui.ts`) — validates the visual primitives. Every panel + button state on one screen, no gameplay, no input wiring beyond pointer-hover. Title text + idle/hover/pressed buttons rendered as a static cookbook.

Conflating them muddles each fixture's responsibility — a regression in one concern shouldn't require investigating the other. Each fixture gets its own boot, its own (optionally stripped) plugin, its own HTML shell, and its own build-script entry per the "Debug build pipeline rename" recipe. The deploy step's `cp -r dist/. _site/.../<sub>/` picks all fixtures up automatically — no `pages.yml` change needed when adding a new one.

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

### `make_eye_follow_system` accepts any `Component<{x, y}>` position (positive finding)

Forge's `make_eye_follow_system` (eye / pupil tracking) is generic over the position component shape — it accepts any `Component<{x, y}>`. Confirmed working for:

- `pos_c` (continuous-motion: arena) — integer-snapped per tick
- `visual_pos_c` (cell-step + tween: loot, progress, bestiary) — lerped per tick

Future subsystems don't need to worry about the position-component shape matching — just pass whichever one the player's eyes should track. Surfaced in Phase 5.9.1 (arena visual parity).

## Architecture patterns

### Game-state gates, NOT `time.scale = 0`

Do NOT model frame-pauses (hitstop, level-up pause, dialogue freeze) as `ctx.time.scale = 0`. `time.advance(real_dt, each)` increments the accumulator by `real_dt * scale`; with `scale = 0` the accumulator never fills, `sch.tick` never fires, and the `pre`-stage release system that's supposed to restore `scale = 1` never runs. Permanent freeze.

Correct pattern: a gate resource (e.g. `hitstop_r.remaining > 0`, `paused_r.value`) → every gameplay system early-returns. A `pre`-stage release decrements/clears the gate; that release system must NOT gate on itself. `time.scale` stays at `1`. Render-stage systems keep ticking (shake + flash + light-fx continue to decay through the freeze — intentional). Replay determinism is preserved because `time.tick` advances normally. See `subsystems/arena/src/systems/hitstop.ts` and arena FRICTION.md §1 (commit `52ba5b6`).

### Real-time melee + sacrifice-on-contact enemies need a swing-active window, NOT edge-triggered hits

Edge-triggered melee (`ctx.input.just("swing")` → kill adjacent) works only when the player's input phase and the enemy contact phase reliably align in the same tick. In real-time subsystems where chasers sacrifice-on-contact (despawn + damage as soon as they reach chebyshev-1), the player-perceived window for a Z press is essentially 0 — every chaser dies to contact before any edge-trigger can land. Z feels broken even though the code is "correct".

Correct pattern: Z press queues `swing_state_r.active_until_tick = current_tick + WINDOW` (~15 ticks ≈ 250ms — a swing arc duration). Melee-swing system fires every tick while the window is open, killing any adjacent chaser. After the window expires, no effect until next Z press. Contact-damage's sacrifice behaviour stays — the window is short enough that spam-killing isn't possible. `swing_state_r` IS in the snapshot (replay determinism). See `subsystems/progress/src/systems/melee-swing.ts` + progress FRICTION.md §24 (commit `1b2acd0`). The previous note below about "dir_c persistence is critical for melee" is partially stale — current progress melee uses chebyshev-adjacency, not dir_c, but the convention still applies if a future subsystem ships a directional ranged ability.

### Transient state in factory closures, not resources

Anything in the resource bag is contracted into the snapshot surface. Click queues, animation pending-flags, network in-flight requests, DOM event buffers — anything that must NOT survive snapshot/restore — belongs in a factory closure, not a resource.

Pattern: `make_<system>(): { system: System; <imperative_setter>(): void }`. The returned system is registered; the imperative setters are called by DOM handlers / replay bridges / etc. The closure-captured state never enters the snapshot surface. Loot's inventory click queue is the canonical example: `make_inventory_system(): { system, queue_click }`. See `subsystems/loot/src/systems/inventory.ts` and loot FRICTION.md §4.

### Reusable UI primitives — game-side until 3rd consumer

UI primitives (panel, button, future modal/list/dialog) live under `subsystems/<sub>/src/ui/` until 3+ subsystems consume them — at which point they promote to `@f0rbit/forge/ui`. Same 3-consumer gate as the chaser-AI bundle (see "Convention for duplicating bestiary's chaser AI" above), applied to UI.

Canonical shape (from `subsystems/progress/src/ui/`):

- **`assets.ts`** — `UiTextureName` string-literal union, name → URL map, `load_ui_assets(): Promise<Record<UiTextureName, Texture>>` helper that resolves before forge's `boot()`.
- **`panel.ts`** — `make_panel({ texture, width, height, insets? }): { container }`. Returns `{ container }` (not the `NineSliceSprite` directly) so callers can `addChild` text / siblings on top without slice math leaking into the public API.
- **`button.ts`** — `make_button({ idle_tex, hover_tex?, pressed_tex?, width, height, label?, insets? }): { container, set_state, get_bounds }`. `set_state("idle" | "hover" | "pressed")` swaps layered NineSlice children OR modulates `idle.tint` when only `idle_tex` is supplied. `get_bounds()` returns `{x, y, w, h}` so pure-function hit-test helpers stay load-bearing.

Header convention: each file carries a `// FORGE-PROMOTION-CANDIDATE` header listing all known consumers + the planned promotion phase (currently Phase 8 `main`). Reuses the same comment shape as the chaser-AI bundle. Density of promotion-candidate headers across the repo is the signal future agents look for when scoping forge bumps.

Current count: 1/3 consumers (progress only). See "Forge promotion candidates (deferred)" table below.

### Game shell — resource-driven FSM with copied bestiary `fsm.ts`

Subsystems that ship landing / win / lost screens use a `game_state_r` resource keyed by `"menu" | "playing" | "won" | "lost"`. Every update-stage gameplay system early-returns when `state !== "playing"`. Render-stage systems keep running so overlays (menu, win banner, lost banner) continue to display + animate at full `time.scale = 1`.

Transitions live in a single `game-state.ts` system at `pre` phase 0 — it inspects health, wave state, and input actions, calls a tiny FSM helper (`fsm.ts`, ~12 LOC, copied byte-identical from bestiary's), and on the transition into `playing` re-runs `setup_arena` (idempotent).

Boot flow: `main.ts` wires the three overlay screens as siblings of `surface_sprite` via `addChildAt(palette_idx)` (per the "Sibling z-order in `app.stage`" recipe), mirrors viewport scale + offset on resize, and does **NOT** call `setup_arena` at boot — the FSM owns the spawn step.

Per "Game-state gates, NOT `time.scale = 0`" above — gate via resource early-return, never via `time.scale`. The menu screen runs at full `time.scale = 1` so overlay animations are smooth.

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

### Re-record replay fixtures when changing rng-consuming setup

Adding or reordering any rng-consuming step in startup or pre-stage breaks existing recorded replays. Examples that require a fresh recording + new expected hash:

- Pickup placement order or count
- Enemy spawn slot reservation (changes the draw count before player spawn)
- Perk choice shuffle (changes which 3 of N perks appear at LV-up)
- Anything calling `ctx.rng.fork()` or `ctx.rng.next_*()` at startup

Even visually-identical changes (e.g. spawning a wall + floor entity alongside the player) do NOT require re-record IF those entities don't enter the world-hash projection AND they don't consume from `ctx.rng`. arena Phase 5.9.1 (walls + floors, no game-state shell) needed NO re-record because the projection is `{ player_pos, wave_state, health, particles }` and floor/wall spawn doesn't roll dice. arena Phase 5.9.4 (game shell with deferred `setup_arena`) **did** need re-record because the rng-draw sequence shifted by one tick.

Workflow: record at `f0rbit.github.io/echo/<sub>/` via the in-page recorder → save the JSON → update `expected_hash` in `test/replay.test.ts` → confirm replay-as-test passes.

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
| `forge.ui` (panel + button `NineSliceSprite` wrappers) | progress | boss likely #2, hub or main likely #3 | end of Phase 8 `main` | `forge/src/ui/` |

**`forge.ui` promotion shape:** generalise `UiTextureName` from a fixed string-literal union to a string-keyed `Record<string, Texture>` — the wrapper API shouldn't constrain consumer-specific asset names. `panel.ts` + `button.ts` already accept `Texture` (not URL strings) so the consumer controls loading; only `assets.ts`'s name-typing needs to relax at promotion time.

Note: `wall_autotile` shipped in `@f0rbit/forge/autotile` v0.5.0 (Phase 5.9.0) and is no longer deferred — consumed by bestiary, dungeon-walk, arena, loot, and progress.

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
