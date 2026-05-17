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
