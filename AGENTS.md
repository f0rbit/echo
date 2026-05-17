@~/.claude/AGENTS.md

# echo — agent notes

`echo` is an infinite dungeon crawler built on `@f0rbit/forge`. The repo is a bun-workspaces monorepo of seven small playable subsystems (`subsystems/<name>/`) plus a composed final game (`main/`) and a static landing site (`hub/`). See [`PLAN.md`](./PLAN.md) for the full scoping document.

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

### Wall sprites + autotile

`subsystems/<sub>/src/systems/wall-autotile.ts` (byte-identical between bestiary + dungeon-walk) implements **Godot 3x3 minimal autotile** against the 0x72 `atlas_walls_low-16x16.png` sheet, which was designed for exactly this algorithm. Don't go back to 4-bit bitmask — the resulting corner / T-junction tiles don't visually connect because 0x72's named frames (`wall_mid`, `wall_top_left`, etc.) were designed for hand-placed 16×32 layered rendering, not for a 16-tile bitmask grid.

The algorithm: 8-direction neighbor sample → per-corner state (OUTER/SIDE_A/SIDE_B/CONCAVE/FILLED) → 47-entry lookup → tile (col, row). Diagonal-gating rule: a diagonal neighbor only matters when both its adjacent cardinals are also walls (collapses 256 raw 8-neighbour patterns onto 47 unique tiles). Snapshot tests in `test/wall-autotile.test.ts` + `test/fixtures/pattern-to-tile.json` regression-guard the mapping.

If we ever switch sprite packs: the new pack's wall sheet must be authored to Godot 3x3 minimal (or supply a custom lookup table conforming to the same corner-state interface). Other autotile conventions (RPG Maker XP, Wang/blob) need different lookups.

### Walls render on top of floors via explicit z-order

Wall sprite frames have transparent edges (especially side/edge pieces — designed to show floor through them). So every cell — wall AND floor — gets a floor entity (giving it a floor sprite). Walls get an additional `wall_c` entity, which gets a wall sprite on top via autotile. Z-ordering: `sprite_c.z` = 1 (floor) / 2 (wall, exit) / 3 (player, mobs); `world.sortableChildren = true`. Insertion order is unstable because `wall_autotile_system` runs at startup but `sprite_attach_system` runs every post-stage tick — explicit z is the only reliable solution.

### Continuous motion vs. cell-step

Cell-step subsystems (`bestiary`, `dungeon-walk`) integrate via `g.move_tile` and use `pos_c` (snapped) + `visual_pos_c` (lerped) + `tween_step_system` to hide the cell jumps. Continuous-motion subsystems (`arena`) integrate `vel_c { vx, vy }` into `pos_c` directly each tick — there is no `visual_pos_c` and the tween system is omitted. `dir_vec_c` is repurposed as **facing persistence**: only updated on non-zero input, so a stationary player still has a heading for melee/ranged direction.

Do not mix the two models in one subsystem. Pick one at scaffold time. See `subsystems/arena/src/systems/movement.ts` and arena FRICTION.md §8.

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

### Resources live on `ctx.res`, not `world.res`

Startup systems that read or initialise resources need the `ctx` parameter — `world` on its own has no `res` accessor. Signature: `(world, ctx) => { ctx.res.get(foo_r) }`.

### `world.spawn(...)` is variadic over `[Component, value]` tuples

Spawn as `world.spawn([pos_c, p], [vel_c, v])` — pass each component-value pair as a separate argument. Do NOT wrap the pairs in an outer array (`world.spawn([[pos_c, p], [vel_c, v]])` is wrong and will silently spawn an empty entity).
