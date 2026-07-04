# Forge — API gotchas, debug surface, versions, promotion

> **Read the "API gotchas" section before writing any forge ECS code** — these four traps bit three separate parallel coders in one phase, and then bit again in two later phases. Reading this section before each new file beats trusting recall (loot FRICTION.md §14, progress FRICTION.md §16).

## API gotchas

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

### Import locations that aren't where you'd guess

- `snapshot_schema` is re-exported from the `@f0rbit/forge` **root** — `@f0rbit/forge/snapshot` does not exist as a published path (progress FRICTION.md §8).
- `is_dev()` lives at `@f0rbit/forge/debug`.
- `event_to_world` lives at `@f0rbit/forge/pixi`.
- Wall autotile lives at `@f0rbit/forge/autotile` (v0.5.0+).
- Lighting lives at `@f0rbit/forge/light`.

### `app.palette.register` is clean (positive finding)

`app.palette.register<A>(cmd: Command<A>)` with Zod-validated `args` schema works without friction for custom commands (`/save`, `/load`, `/grant-xp`, `/kill-all`, …). No promotion candidate needed (progress FRICTION.md §7).

## Debug surface — `window.__forge` + `app.screenshot()` + palette

Every subsystem boots forge v0.5.4+ with `debug: is_dev()` and an `app_id: "<subsystem>"` (debug fixtures hard-code `debug: true`). When the debug surface is on, forge attaches `window.__forge = { app, world, res, schedule, time, rng, palette, screenshot }` and registers builtin palette commands (`/screenshot`, `/dump-state`, `/pause`, `/resume`, `/step [n]`, `/slowmo <f>`, `/normal`). `App.screenshot()` is always callable — it just no-ops to an empty `Blob` when `debug: false`.

`is_dev()` auto-detects via `__DEV__` global + `NODE_ENV`. **Don't roll your own dev/prod guard** — defer to forge so the dev/prod policy stays in one place.

Chrome-DevTools-MCP recipes (preferred over synthetic-keyboard / `canvas.toDataURL()` workarounds — progress FRICTION.md §22):

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

## Version policy

- Subsystems depend on `@f0rbit/forge` from **npm** — never via workspace symlink.
- Subsystems may sit on **different forge minors** during development. Drift is tolerated — forcing a global bump after every forge change would burn replay re-recording for no benefit.
- **Phase 8 aligns everything** to the latest forge minor, re-runs every replay test, and re-records any that drift. See `PLAN.md` §5 for the per-phase forge bump table.

## Promotion criteria

From `PLAN.md` §5:

| Situation | Action |
|-----------|--------|
| Helper duplicated in **2+ subsystems** | Propose forge promotion |
| Used in **1 subsystem** but clearly engine-shaped | Hold game-side until a second subsystem confirms the shape; reassess at Phase 8 |

Until promotion, copies follow the duplication conventions in `docs/architecture.md` ("Convention for duplicating bestiary's chaser AI"): `// FORGE-PROMOTION-CANDIDATE` headers, paused-gates, module-constant divergence, sync-back on edits.

## Promotion candidates (deferred) — live tracker

Boss / hub / main planning MUST consult this list before scaffolding. Update this table when a new consumer lands or a candidate ships.

| Candidate | Current consumers | Imminent consumer | Recommended promotion phase | Target path |
|-----------|-------------------|--------------------|-----------------------------|-------------|
| `localstorage_store()` (browser persistence backend mirroring corpus `create_file_backend`) | progress | hub (Phase 7 — settings, run-list, recent-saves) | end of Phase 7, forge v0.4.x patch | `forge/src/storage/` |
| `compose_modifiers()` (additive + multiplicative stat composition over a sources list) | loot, progress | main (Phase 8 composes equipment + perks against the same `Stats` shape) | Phase 8 `main` | `forge/src/composition/modifiers.ts` |
| A* + chaser AI bundle (`astar.ts` + `ai-chaser.ts` + `path-step.ts` + `creature-occupancy.ts`) | bestiary, progress | boss (Phase 6) → three copies by end of Phase 6 | end of Phase 8 `main` (after composition stabilises the shape) | `forge/src/ai/` |
| `forge.ui` (panel + button `NineSliceSprite` wrappers) | progress | boss likely #2, hub or main likely #3 | end of Phase 8 `main` | `forge/src/ui/` |
| `fsm.ts` (12-LOC FSM helper) | bestiary (AI), arena (shell) | boss (Phase 6 shell + boss phases) | evaluate at Phase 8 (state shapes differ between consumers) | TBD |
| `forge.script` scripted-sequence DSL | — (boss will hand-roll first) | boss (Phase 6), hub cutscenes (Phase 7) | forge v0.4.0 alongside Phase 6 per PLAN.md §4.6 | `forge/src/script/` |

Shipped and no longer deferred: `wall_autotile` → `@f0rbit/forge/autotile` v0.5.0 (Phase 5.9.0) — consumed by bestiary, dungeon-walk, arena, loot, and progress.

**`forge.ui` promotion shape:** generalise `UiTextureName` from a fixed string-literal union to a string-keyed `Record<string, Texture>` — the wrapper API shouldn't constrain consumer-specific asset names. `panel.ts` + `button.ts` already accept `Texture` (not URL strings) so the consumer controls loading; only `assets.ts`'s name-typing needs to relax at promotion time. Move the `UiTextures` type from `perk-choice-ui.ts` to `assets.ts` at the same time (progress FRICTION.md §23).

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
