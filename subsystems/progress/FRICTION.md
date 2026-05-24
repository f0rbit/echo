# progress — friction notes

## Status

Progress subsystem complete (v0.0.1 against forge 0.4.3). Cell-step player + 1-tile melee + bestiary-style chasers in a 320×180 single-room arena; XP-driven levelling with a pause-and-pick 5-perk pool; auto-save on every kill / level-up via a localStorage-backed `disk_save`; mid-replay snapshot round-trip AND disk-format round-trip are byte-stable; debug fixture page bypasses real combat to verify the level-up + save loop autonomously. Live at https://f0rbit.github.io/echo/progress/ + /progress/debug/. 75 tests across 8 files.

Friction hit while building this subsystem — terse, ordered by impact for the next agent (likely `boss`, Phase 6). Not a postmortem.

## 1. Bestiary's chaser AI is now duplicated three times

`astar.ts`, `systems/ai-chaser.ts`, `systems/path-step.ts`, and `systems/creature-occupancy.ts` are byte-near copies of bestiary's equivalents. **This is the third copy** (bestiary, progress, and boss-to-come will be the fourth signal). Every file carries a `// FORGE-PROMOTION-CANDIDATE` header listing all known consumers. If you edit any of these in progress, sync the change back to bestiary or surface the divergence — silent drift between copies erodes the promotion case at Phase 8. See `subsystems/progress/src/astar.ts` and §3 of PROPOSED-AGENTS-UPDATES.md.

## 2. `state_c` shape diverged from bestiary; resolved via module constant

Bestiary's `state_c` carries `{ kind, aggro_radius }`. Progress only needs `{ kind }` because every chaser shares the same aggro radius. Phase 5.3 chose a module-level constant `AGGRO_RADIUS = 8` in `ai-chaser.ts` rather than carrying the field on every entity. If a future subsystem needs per-chaser tuning (e.g. boss minions vs. elites), widen `state_c`; until then the constant is the right call. **Pattern: component-shape divergences resolve via module constants until the third consumer forces a generalised shape.**

## 3. `stats_c.xp_gain_mul` was missing from the Phase 5.0 scaffold

The `perk.xp_gain_mul` perk (Quick Learner, +0.25 mul) needs an `xp_gain_mul` field on `stats_c` for compose. Phase 5.0 missed it; Phase 5.2 added it when implementing `compute_stats`. **Future scaffold passes should pre-read the systems they'll scaffold for and enumerate every stat-modifier field up front** — `compute_stats(base, perks, registry)` failing to typecheck because the target field doesn't exist is a friction trap that's trivially preventable.

## 4. `dir_c` facing persistence pattern diverges between loot and progress

Loot writes `{dx: 0, dy: 0}` to `dir_c` every tick when no input arrives. Progress writes to `dir_c` **only on nonzero input** — so a stationary player retains their last heading for the next melee swing. Same component, two semantics. Both are correct for their subsystem (loot has no melee; progress does). **Convention proposal: cell-step + melee subsystems use facing-persistent `dir_c`; cell-step + no-melee subsystems can write blindly.** See PROPOSED-AGENTS-UPDATES.md §2.

## 5. Closure-held `ctx.rng.fork()` streams are NOT in the snapshot

`enemy-spawn.ts` and `xp.ts` (perk-choice shuffle) lazily fork `ctx.rng.fork()` on first use; the forked stream lives in closure state. **`Snapshotter` only captures the parent `ctx.rng` state, not the closure-captured forks.** Post-restore, a re-fork from the restored `ctx.rng` state starts from a different draw count than the original closure (which has consumed N draws since the fork point) — so the new fork's stream is offset from the original.

Phase 5.6 worked around this by pinning the mid-replay `snap_tick` to 1460 — after the third perk-pick fork-draw and before the next spawn fork-draw at tick 1500. The parallel sim continued from restore stayed in sync with the source sim because the next fork happened identically in both.

**Real fix (recommended for future subsystems): re-fork on every tick.** `const r = ctx.rng.fork()` inside the system body, not closure-captured. RNG forks are cheap (single-step splittable hash); the per-tick re-fork is deterministic and immune to snapshot drift. **Surface as a snapshot/persistence rule** — see PROPOSED-AGENTS-UPDATES.md §1.

## 6. Disk-format round-trip passed first try once `canonical_stringify` was in place

The new load-bearing assertion (Phase 5.6, `JSON.parse(JSON.stringify(snap)) → safeParse → restore → equal world_hash`) passed on the first run after wiring `canonical_stringify` through. The localStorage wire-format proves out: zod's `snapshot_schema` is fully forwards-compatible (version-gated), and `JSON.parse` preserves enough of the snapshot shape that nothing extra is needed beyond what loot's in-memory tests already verified.

## 7. `palette.register` API is clean — no gap surfaced

`app.palette.register<A>(cmd: Command<A>)` with Zod-validated `args` schema. Forge exposes it cleanly; no friction registering `/save`, `/load`, `/perk-list`, `/grant-xp`, `/kill-all`, `/save-clear`. **No promotion candidate needed.**

## 8. `snapshot_schema` re-export location not obvious from the plan

`.plans/progress.md` §2 Q12 (`import { snapshot_schema } from "@f0rbit/forge"`) is correct; the schema is re-exported from `@f0rbit/forge` root, NOT from `@f0rbit/forge/snapshot` (which doesn't exist as a published path). Minor friction; surface in subsystem AGENTS notes if the next subsystem author goes hunting for it.

## 9. `Snapshotter.restore()` is destructive — pattern transferred cleanly

Loot's `make_restore_target` helper (FRICTION.md §2 + the merged AGENTS.md "Snapshotter.restore() is destructive — boot the target first") transferred verbatim into `test/replay.test.ts`. No additional friction; the documented pattern works. **Reinforces the case for the merged AGENTS.md rule.**

## 10. Recorder iterations: 3 (vs. loot's 1, arena's 5)

Progress's `record-level-and-save.ts` took 3 iterations:
1. First attempt: walk-to-chaser logic mis-handled the cell-step facing edge case (player swung the tick before `dir_c` updated; missed the kill).
2. Second: fix dir_c order; replay completed but chose perks `[0, 0, 0]` (all `perk.atk_plus`) because the shuffle's seeded order favoured atk first across three calls. Picked indices [0, 1, 2] instead to get DISTINCT perks for the replay end-state assertion (`stats_c.atk === 8`, `def === 4`, `max_hp === 15`).
3. Third: `snap_tick` selection — initial pick at tick 1450 (BEFORE the third perk-pick fork-draw) caused the parallel sim's RNG to advance by an unexpected fork, end-state hashes diverged. Moved to tick 1460 (AFTER the third pick, BEFORE the next spawn fork).

Better than arena's 5 (continuous-motion compounding), worse than loot's 1 (no fork-RNG dependencies). The fork-RNG snapshot pin (see §5) was the actual cost.

## 11. `world.despawn` returns `Result<void, EngineError>` — not void

`palette-cmds.ts` `/kill-all` ignores the result intentionally (entities are queried then despawned in the same call; impossible for a just-queried `Id` to error). But the type signature mandates a `.ok` check — `// eslint-disable` or `void` cast required if strict result-handling lint is on. Worth flagging in AGENTS.md "Forge API gotchas" so a strict consumer (e.g. corpus pipe chain) doesn't trip. See PROPOSED-AGENTS-UPDATES.md §6.

## 12. `creature_occupancy_system` runs in `pre` stage, not `update`

Plan §5.7 (the debug fixture) said `update` stage. Production wires it in `pre` (Phase 5.3) — which is correct: occupancy must be fresh BEFORE `ai-chaser` queries it in `update`. Followed production. Plan was a typo.

## 13. Debug fixture shares production localStorage key intentionally

`echo:progress:save:slot-1` is the only key. Debug fixture writes to it; production reads from it. **Consequence:** running the debug fixture page then reloading the production page shows the debug-saved state (the mid-fixture snapshot at tick 155, with level-up state mid-pause). Useful for verifying restore visually with zero manual input — but destructive to any prior production save in the same browser profile. Intentional, surfaced in PROPOSED-AGENTS-UPDATES.md §4.

## 14. Debug fixture bypasses real combat — direct XP grant

Plan suggested auto-swing + auto-chase choreography. Production debug fixture instead does `xp_sys.emit_xp_gain(100/200/300)` directly at ticks 30/80/130, sized to fire EXACTLY one level-up per grant given `xp_threshold(level) = 100 * level`. Simpler than choreographing chaser pathing + swing timing + facing — and the fixture's job is to verify the level-up state machine + persistence, not combat. Combat is covered by the replay test.

## 15. Auto-save uses post-stage diff-check, not mark_dirty plumbing

`auto-save.ts` keeps closure-local `prev_chaser_count` + `prev_level`; fires a save when either changes. This avoids plumbing `mark_dirty_for_save` flags through every system that could trigger persistence (xp.ts, melee-swing.ts, perks.ts) — all three stay untouched. The closure approach is the right tradeoff: post-stage runs once per tick, the comparison is two integer reads, and the resulting code is one file rather than four. Documented as a deliberate divergence from plan §5.5.

## 16. AGENTS.md "Forge API gotchas" still earned its keep

Same lesson as loot FRICTION.md §14: `world.despawn` (not `delete`), `world.spawn(...)` variadic-tuple, `ctx.res` not `world.res`, marker components elided from query tuples — all four bit again during sanity checks across phases 5.2 / 5.3 / 5.5. Reading the section before each new file beats trusting recall. Reinforces the rule's value.

## 17. `NineSliceSprite` + lighting filter + RenderTexture pipeline

The Phase 1 cookbook fixture confirmed it visually + Phase 2's production modal reconfirmed: the modal lives on `app.stage` as a sibling of `surface_sprite`, so the `app.render.world` lighting filter does NOT touch it. The 9-slice panel + buttons render at full brightness regardless of the player's eye-light reach — which is what we want for a top-most modal.

If a future consumer puts a `NineSliceSprite` INSIDE `app.render.world` (don't), the filter applies and the slice corner regions get darkened in unseen areas — even though the modal is "above" gameplay logically. Use `app.render.debug_overlay` (unfiltered) for HUDs / debug markers or an `app.stage` sibling for game UI that wants consistent brightness. See `subsystems/progress/src/main-debug-gui.ts` for the cookbook precedent and `subsystems/progress/src/systems/perk-choice-ui.ts:153-171` for the production wiring.

## 18. Option B asset wiring chosen over lazy `Texture.from()`

Phase 1 picked Option B (pre-boot `Assets.load([...urls])` via `subsystems/progress/src/ui/assets.ts:load_ui_assets()`). Reasoning: (a) it mirrors the established forge pattern for atlases (`boot({ assets: [{ kind: "atlas", ... }] })`), and (b) `NineSliceSprite` rendered with a not-yet-decoded `Texture` shows a blank frame for ~1 tick — visible flicker on slow connections, exactly the moment the user opens the level-up modal.

Option A (lazy `Texture.from(url)` inside `panel.ts` / `button.ts`) was rejected. Pixi's `Assets` cache is process-global, so once `load_ui_assets()` resolves the textures stay hot for `Texture.from(url)` synchronous lookups elsewhere if a future consumer wants the lazy ergonomics anyway.

Boot wiring: `main.ts` + `main-debug.ts` both `await load_ui_assets()` before forge's `boot()` and pass the loaded `Record<UiTextureName, Texture>` into `make_perk_choice_ui` via the required `get_ui_textures` opt.

## 19. Slice-inset derivation by visual inspection

Kenney's pack ships 48×48 panel + border PNGs with a visually ~8 px outer frame on `panel-000.png` + `panel-border-000.png` (the chosen assets). Phase 1 set `DEFAULT_PANEL_INSETS = { left: 8, top: 8, right: 8, bottom: 8 }` in `subsystems/progress/src/ui/panel.ts:34` after visual smoke at the cookbook fixture — the slice corners render cleanly without bleeding the bracket art, and the centre region tiles without visible seams.

The exact pixel inset is sprite-specific and not documented in the Kenney pack. Derive once per sprite by opening the PNG in an image editor, measuring the border thickness, then setting the inset slightly tighter than the visible edge. Module-level constants in `panel.ts` document the choice with the source filename so a future asset swap forces a fresh derivation pass + its own constants.

## 20. `/debug-gui/` is a SEPARATE fixture from `/debug/`

Conflating "UI cookbook" with the existing "level-up loop" fixture would muddle the responsibility of each. `/debug/` (`src/main-debug.ts`) exists to validate the gameplay state machine + persistence — direct XP grants at choreographed ticks, real save/restore round-trip; see FRICTION.md §13–§14. `/debug-gui/` (`src/main-debug-gui.ts`) exists to validate visual primitives — every panel + button state on one screen, no gameplay, no input wiring beyond pointer-hover.

Separate boot, separate plugin (or none), separate HTML. Pattern: one debug fixture per visual concern. The deploy step `cp -r dist/. _site/.../<sub>/` picks both up automatically — no `pages.yml` change needed when adding a new fixture.

## 21. Hover not wired in production despite `Button.set_state("hover")` shape

The `make_button` factory (`subsystems/progress/src/ui/button.ts:64-120`) exposes `set_state("idle" | "hover" | "pressed")` because the cookbook fixture needs all three for visual regression. Production `perk-choice-ui.ts:redraw()` only ever calls `set_state("idle")` — the primary input is keyboard 1/2/3 (no pointer position), and pointer hover adds animation timing complexity (hover-on / hover-off, fade durations) that doesn't justify itself for a 3-button modal that closes immediately on pick.

If a future consumer with many buttons wants hover, opt in at the call site (wire `pointermove` → `set_state("hover")`). The factory shape stays the same. Same goes for pressed-state: a 100 ms "pressed → idle" transition wired before `opts.on_pick` is trivial to add when game-design lands the call — documented as future work in `UI-PROPOSED-AGENTS-UPDATES.md`.

## 22. Local visual smoke needs HTTP — `file://` + ES modules hit CORS

Phase 2's verification coder could not visually smoke from the sandbox: `bun --port N serve` + `python3 -m http.server` were both denied, and opening `dist/index.html` directly via `file://` hit a CORS error on the ES-module `dist/main.js`. The orchestrator worked around it by running `python3 -m http.server 4567` in an unsandboxed shell and screenshotting via Chrome DevTools MCP — fine for orchestrator-driven smoke, but the verification coder couldn't self-validate.

Recommendation for the next subsystem: add a `"serve": "bun --port 4567 serve dist"` script (or equivalent) to each subsystem's `package.json` so the verification coder has an in-bounds path to local HTTP. Worth a follow-up; not blocking Phase 3. See the Phase 2 commit body (`e983c26`) for the original workaround note.

## 23. `UiTextures` exported from `perk-choice-ui.ts`, should live in `src/ui/assets.ts`

Phase 2 exported `export type UiTextures = Record<UiTextureName, Texture>` from `subsystems/progress/src/systems/perk-choice-ui.ts:137` because the boot files (`main.ts`, `main-debug.ts`) were already importing the factory from there — co-locating the opt type avoided an extra import line. Functionally correct.

When promoted to `@f0rbit/forge/ui` (consumer #3 lands), `UiTextures` belongs alongside `UiTextureName` + `load_ui_assets` in `src/ui/assets.ts` — that's the natural home for the texture-shape contract, separate from any particular consumer of the textures. Trivial refactor (move the type, update two import lines); not breaking. Worth a note here so the next agent moves it without re-investigating.

## 24. Edge-triggered melee + sacrifice-on-contact = melee appears to do nothing

User-reported bug: pressing Z in production produced no visible kill. Every chaser died on contact, costing 1 HP each.

Root cause: `melee-swing.ts` fired on `ctx.input.just("swing")` — a 1-tick (~16ms) edge. `contact-damage.ts` is sacrifice-on-contact — the same tick a chaser reaches chebyshev-1 it gets despawned AND deducts 1 HP. So the only tick a Z press could land a kill was the EXACT tick the chaser closed to adjacency. One frame earlier: press wasted. One frame later: chaser already despawned by contact-damage. The 16ms window is functionally unhittable by reaction; the player perceived Z as a dead key. All 74 tests passed because the recorder choreographed Z presses with sub-tick precision and contact-damage was a relatively new addition (Phase 5.4.bugfix); the bug was invisible to the test fixture and obvious in play.

Fix: replaced edge-triggered with a swing-active window. A Z press sets `swing_state_r.active_until_tick = current_tick + SWING_WINDOW_TICKS` (15 ticks ≈ 250ms). Every tick while `current_tick < active_until_tick`, the system scans for chebyshev-1 chasers; first found dies + window resets to 0 (one kill per Z press — Z is a swing, not an AoE pulse). Window naturally expires when the player misses. The swing-window resource is snapshotted so it survives mid-replay restore + disk save/load.

**Pattern: action-game inputs paired with sacrifice-on-contact enemies need a swing window, not edge-triggered hits.** Edge triggers work in turn-based subsystems where the player gets a guaranteed input phase. In real-time + sacrifice-on-contact, the player input phase is asynchronous to enemy contact and the windows don't align. See `subsystems/progress/src/systems/melee-swing.ts` + commit body. PROPOSED-AGENTS-UPDATES.md candidate: surface as a global "real-time melee design pattern" rule once the boss subsystem adopts the same shape.

## 25. `enemy-spawn.ts` re-forks RNG per tick (label-with-tick) instead of closure-captured fork

Phase 5.6's snapshot tests pinned `MID_REPLAY_SNAP_TICK` after death to dodge the closure-held spawn-fork drift (FRICTION §5). When the swing-window fix made the player survive the recorded replay, the post-death pin no longer existed — and the closure-held fork's drift broke the "continue from restored state" assertion.

Applied FRICTION §5's "real fix": `enemy-spawn.ts` now forks via `ctx.rng.fork(\`progress.spawn.${ctx.time.tick}\`)` every spawn tick — no closure state, immune to snapshot drift. The tick-suffixed label gives every spawn-eligible tick a distinct deterministic stream, so the spawn cell at tick N is identical across replays and across pre/post-restore continuations. Replay had to be re-recorded because the spawn sequence changed, but the test invariants stayed (3 picks, level 4, perks {atk, hp, def}).

**Reinforces FRICTION §5: closure-held forks are a snapshot foot-gun. The label-with-tick pattern is the canonical fix** — costs one extra hash per spawn (negligible) and removes an entire class of replay-determinism bugs.
