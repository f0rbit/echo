# Troubleshooting — symptom → cause → fix

> **Search this table FIRST when something misbehaves.** Nearly every entry is a bug that shipped once in this repo and has a documented fix — do not debug from scratch until you've checked here. Each row links to the doc section with the full recipe.

## Gameplay / simulation

| Symptom | Cause | Fix | Details |
|---------|-------|-----|---------|
| Player keeps sliding forever after one keypress | `movement_system` reads `dir_c`, which persists facing after key release | Movement reads the live input vector (`ctx.input.vector`); `dir_c` is for ability direction only | `docs/architecture.md` §dir_c; progress FRICTION.md §4 |
| Game permanently frozen after a pause/hitstop | `time.scale = 0` — accumulator never fills, release system never runs | Gate resource + early-returns; `time.scale` stays 1 | `docs/architecture.md` §game-state gates; arena FRICTION.md §1 |
| Melee key feels dead; enemies die on contact instead | Edge-triggered hit vs sacrifice-on-contact — the landable window is ~1 tick | Swing-active window (`swing_state_r.active_until_tick`), snapshotted | `docs/architecture.md` §swing window; progress FRICTION.md §24 |
| Hit particles / flash / glow never appear | Emit-side system gates on hitstop; `hit_events_r` is cleared before hitstop releases | Emit-side work must NOT gate on hitstop; only advance/decay gates | `docs/architecture.md` §hit-event consumers; arena FRICTION.md §2 |
| Chasers keep moving during a pause (level-up, dialogue) | Copied chaser AI missing the `<sub>_r.paused` early-return gate | Add the gate at the top of every copied AI system | `docs/architecture.md` §chaser copy convention |
| Wave/spawn state silently broken after moving setup into an FSM | Dependent system still runs once at `update` tick 0 against an empty world | Move dependents to `pre` stage with an idempotent bail-out | `docs/architecture.md` §restart sweep |
| Pressing R (restart) fires on the menu screen | Input-driven system not gated on FSM state | Sweep every input-driven system when adding a game-state FSM | `docs/architecture.md` §input gates |

## Rendering / UI

| Symptom | Cause | Fix | Details |
|---------|-------|-----|---------|
| Text blurry / aliased (non-pixel font) | Missing `resolution: 4` (+ `scale.set(0.5)` when the container scales) | Crisp text recipe | `docs/rendering.md` §text recipes |
| Pixel font blurry with anti-aliased edges | Crisp recipe applied to a pixel font (res 4 + downscale re-rasterises the grid) | `resolution: 1`, NO scale.set, integer-multiple fontSize | `docs/rendering.md` §pixel font |
| Pixel font renders as system monospace/serif | Font .woff2 never fetched; `document.fonts.ready` resolves early | `await document.fonts.load("8px 'Press Start 2P'")` before `boot()`, in every entry point | `docs/rendering.md` §font loading; progress FRICTION.md §26 |
| Text clipped at the right edge of a button | `wordWrapWidth` too generous — pixel-font advance widths under-report | `wordWrapWidth = BUTTON_W - 16` | `docs/rendering.md` §pixel font; progress FRICTION.md §27 |
| Modal / UI panel darkened in parts of the screen | UI placed inside `app.render.world` → lighting filter applies | `app.stage` sibling of `surface_sprite`, mirrored on resize | `docs/rendering.md` §game UI overlays |
| Modal renders on top of the palette overlay (or under the game) | `addChild` appends at top of `app.stage` | `addChildAt(stage.getChildIndex(palette_overlay))` | `docs/rendering.md` §sibling z-order |
| Sprites offset by half a tile | Added `+ g.tile / 2` to `pos_c` coords | `pos_c` IS the cell center; anchor 0.5 needs no offset | `docs/rendering.md` §cell coordinates |
| Click position maps to the wrong world coords | Hand-rolled scale math; `worldTransform` reports identity for `app.render.world` | `event_to_world(e, canvas, app.camera)` from `@f0rbit/forge/pixi` | `docs/rendering.md` §canvas→world |
| Walls/floors flicker under entities or stack wrongly | Relying on insertion order (startup vs post-stage attach is unstable) | Explicit `sprite_c.z`: 1 floor / 2 wall / 3 entities + `sortableChildren` | `docs/rendering.md` §z-order |
| Camera shake jitters HUD/palette, or shake is enormous | Mutated `app.stage.position` or `app.render.world.position` | `app.render.set_screen_offset(dx, dy)` (forge ≥0.4.3), render stage after `forge.render` | `docs/rendering.md` §camera shake |
| First modal open shows a blank frame | Lazy `Texture.from()` — texture not decoded yet | Pre-boot `Assets.load` via `load_ui_assets()` | `docs/rendering.md` §9-slice |
| Deployed `/debug/` page 404s on its script | `debug.html` references `./main-debug.js`; the build renames to `main.js` | Reference `./main.js` in `debug.html` | `docs/rendering.md` §debug build rename; arena FRICTION.md §9 |
| Autotile corners/T-junctions don't visually connect | Reverted to 4-bit bitmask lookup | Godot 3x3 minimal (47-entry) via `@f0rbit/forge/autotile` | `docs/rendering.md` §wall autotile |

## Snapshot / replay / tests

| Symptom | Cause | Fix | Details |
|---------|-------|-----|---------|
| Restore looks right for one tick, then diverges ticks later | Closure-held `ctx.rng.fork()` stream not in snapshot | Re-fork per tick with tick-suffixed label: `ctx.rng.fork(\`<sub>.<use>.${ctx.time.tick}\`)` | `docs/persistence-replay.md` §rng forks; progress FRICTION.md §5, §25 |
| Restored entities vanish on the next tick, no error | Restore target never ran its boot tick; startup gate re-fired and clobbered the world | `make_restore_target()` — boot first, then `snapper.restore` | `docs/persistence-replay.md` §destructive restore; loot FRICTION.md §2 |
| World-hash differs for byte-identical state | Zod `safeParse` reorders keys to schema order; `JSON.stringify` is order-sensitive | `canonical_stringify` (sorted keys at every depth) | `docs/persistence-replay.md` §canonical-stringify; loot FRICTION.md §1 |
| Replay hash changed after a "harmless" startup change | The change consumes rng (or shifted the draw sequence by a tick) | Re-record the fixture + update `expected_hash` | `docs/persistence-replay.md` §re-record |
| Replay test aborts at exactly 5 s | bun test default per-test timeout | Pass `REPLAY_TIMEOUT_MS` (30000) as third arg to `test()` | `docs/persistence-replay.md` §timeouts; arena FRICTION.md §7 |
| Test world is empty / registries missing | `harness.tick()` runs only the `update` stage — no startup/pre/post | Seed resources + entities directly via `test/fixtures/<sub>-scenario.ts` | `docs/persistence-replay.md` §harness; loot FRICTION.md §11 |
| UI clicks don't replay | DOM events don't flow through forge's bindings layer | Synthetic action bindings on reserved keys (F1..F12) + bridge system | `docs/persistence-replay.md` §synthetic bindings; loot FRICTION.md §7 |
| Production save gone after running the debug fixture | Shared localStorage key — intentional | Expected behaviour; documented per subsystem | `docs/persistence-replay.md` §disk-save key; progress FRICTION.md §13 |

## Forge API

| Symptom | Cause | Fix | Details |
|---------|-------|-----|---------|
| Query destructuring is off by one | Marker components (`Component<true>`) are elided from result tuples | Destructure data-carrying components only | `docs/forge.md` §gotchas |
| `world.delete is not a function` | No such method | `world.despawn(id)` | `docs/forge.md` §gotchas |
| Lint/type error on ignored despawn | `despawn` returns `Result<void, EngineError>` | `void world.despawn(id)` or handle `.ok` | `docs/forge.md` §gotchas |
| `world.res` is undefined | Resources live on `ctx` | System signature `(world, ctx)`; use `ctx.res` | `docs/forge.md` §gotchas |
| Spawned entity has no components | Component pairs wrapped in an outer array | `world.spawn([pos_c, p], [vel_c, v])` — variadic | `docs/forge.md` §gotchas |
| Can't import `snapshot_schema` from `@f0rbit/forge/snapshot` | No such subpath | Import from the `@f0rbit/forge` root | `docs/forge.md` §imports |

## Tooling / environment

| Symptom | Cause | Fix | Details |
|---------|-------|-----|---------|
| Screenshot shows the change "didn't apply" | Stale process still bound to the port; new server silently lost the bind | `curl -s http://localhost:<port>/ \| head -5`, compare to `dist/index.html`; `lsof -i :<port>` → kill → re-serve | `docs/verification.md` §visual smoke |
| Opening `dist/index.html` via `file://` fails with CORS | ES modules require HTTP | `bun run serve:<name>` (serves via `tools/serve-dist.ts`) | `docs/verification.md`; progress FRICTION.md §22 |
| `bun install` fails after creating `main/` | Empty workspace directory in `workspaces` | Add `"main"` to workspaces only once `main/package.json` exists | `docs/new-subsystem.md` step 2 |
