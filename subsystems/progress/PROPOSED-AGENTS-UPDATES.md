# Proposed AGENTS.md updates — progress Phase 5.0–5.8

These are conventions that emerged while building `subsystems/progress/`. Each block is shaped to paste into `~/dev/echo/AGENTS.md` at the indicated section. Review one-by-one and either merge into AGENTS.md or discard — **nothing here has been written to AGENTS.md yet**.

Citations point to FRICTION.md (this subsystem) and the relevant commits in `a952109..48574fe` + this docs commit.

---

## 1. Closure-held `ctx.rng.fork()` streams are NOT in the snapshot

**Section: "Snapshot / persistence"**

`Snapshotter` captures `ctx.rng` state only. Streams produced by `ctx.rng.fork()` and held in factory closures (e.g. `enemy-spawn.ts`'s spawn-RNG, `xp.ts`'s perk-shuffle RNG) **do not survive restore.** Post-restore, a re-fork from the restored `ctx.rng` state starts from the same draw count, but the original closure has advanced past that fork by N draws — so the new fork's stream is offset.

**Two fixes:**

- **(a) Re-fork every tick** (recommended). `const r = ctx.rng.fork()` inside the system body, not closure-captured. Cheap (single-step splittable hash), deterministic, immune to snapshot drift.
- **(b) Snapshot the forked stream state explicitly** by carrying it on a resource that IS in the snapshot surface. Larger surface area; only if `(a)` is too expensive (rare).

**Symptom if you ignore this:** mid-replay snap-and-restore appears byte-stable for one tick, then diverges several ticks later as the next fork-draw happens at different counts in source vs. restored sim.

See progress FRICTION.md §5.

---

## 2. Cell-step + melee subsystems use facing-persistent `dir_c`; cell-step + no-melee can write blindly

**Section: "Rendering conventions" → "Continuous motion vs. cell-step"**

Two patterns now exist for `dir_c` in cell-step subsystems:

- **Loot pattern** (no melee): write `{dx, dy}` every tick — `{0, 0}` when no input. `dir_c` is just last-input.
- **Progress pattern** (cell-step + melee): write `dir_c` **only on nonzero input**. A stationary player retains their last heading so `Z` swing has a direction. **Critical for melee subsystems** — without persistence, the swing fires in `{0, 0}` direction and hits nothing.

Pick the pattern at scaffold time based on whether the subsystem ships a directional ability. Document the choice in the subsystem's `AGENTS.md`. See progress FRICTION.md §4.

---

## 3. Convention for duplicating bestiary's chaser AI

**Section: "No `@echo/shared`" (extension)**

When copying bestiary's cell-step chaser AI to a new subsystem:

- **(a) Add the `<sub>_r.paused` early-return gate** at the top of each copied system. Bestiary doesn't pause; downstream subsystems do. Forget the gate and chasers chase through the level-up pause.
- **(b) Annotate every copied file with a `// FORGE-PROMOTION-CANDIDATE` header** listing all known consumers and the planned promotion phase (currently Phase 8 `main`). Promotion-candidate density on a file is the signal future agents look for.
- **(c) Component-shape divergences** (like `state_c { kind, aggro_radius }` in bestiary vs. `state_c { kind }` in progress) resolve via **module constants** in the consumer — not by widening the shared shape. Only the third consumer forces a generalised shape; until then, copies diverge locally.

**Phase 8 `main` is the promotion target.** Three copies exist as of progress (bestiary, progress, boss-to-come is the fourth). See progress FRICTION.md §1.

---

## 4. Disk-save key shared between production and debug fixture is intentional

**Section: "Snapshot / persistence"**

The progress debug fixture writes to `echo:progress:save:slot-1` — the same key as the production page. **Intentional:** running the debug fixture then reloading the production page surfaces the restored state visually, with zero manual input needed.

**Consequence:** debug fixture is destructive to any prior production save in the same browser profile. **Surface this in the subsystem's FRICTION.md** so a user who plays a real run then runs the debug fixture knows their save was overwritten.

See progress FRICTION.md §13.

---

## 5. Stat-modifier fields used by systems should appear in scaffold's `components.ts`

**Section: "Pre-scaffold checklist"** (new subsection)

Before writing `components.ts` for a new subsystem, **read every system file in §5 of the plan** and enumerate every stat / state-modifier field referenced. Progress's `xp_gain_mul` perk needs `stats_c.xp_gain_mul`; Phase 5.0 scaffold missed it and Phase 5.2 had to amend `components.ts` mid-system-implementation. Trivially preventable with a pre-read pass.

See progress FRICTION.md §3.

---

## 6. `world.despawn` returns `Result<void, EngineError>`

**Section: "Forge API gotchas"**

`world.despawn(id)` returns `Result<void, EngineError>`, not `void`. Most call sites can ignore it (a just-queried `Id` cannot error on despawn), but strict-result-handling consumers (corpus pipe chains, lint-enforced `.ok` checks) must handle it explicitly. Pattern:

```ts
// safe-to-ignore call site (e.g. /kill-all palette command):
for (const [id] of world.query([chaser_c]).collect()) void world.despawn(id);

// strict-handling site (rare):
const r = world.despawn(id);
if (!r.ok) return err(r.error);
```

See progress FRICTION.md §11.

---

## 7. Forge promotion candidate: `localstorage_store()` for `@f0rbit/forge/storage`

**Not an AGENTS.md addition — a promotion proposal.**

Add `create_localstorage_backend()` to `forge/src/storage/` mirroring `create_file_backend` from corpus. Exposes `engine_store({ backend: "localstorage" })` for browser-side persistence.

- **Current consumers:** progress (shipped).
- **Imminent consumer:** hub (Phase 7 — settings, run-list, recent-saves).
- **Promotion gate:** two consumers triggers promotion per PLAN.md §5. **Promote at end of Phase 7**, ship as forge v0.4.x patch.

Progress currently ships a 30-LOC game-side `disk-save.ts` that bypasses corpus and writes `JSON.stringify(snapshot)` directly. Recommended migration path: hub builds on top of the same direct-localStorage shape; when both subsystems use it, lift into forge.

See `.plans/progress.md` §4 (now `subsystems/progress/PLAN.md` §4) Gap analysis.

---

## 8. Forge promotion candidate: `compose_modifiers()` helper

**Not an AGENTS.md addition — a promotion proposal.**

Both `subsystems/loot/src/systems/stats.ts` and `subsystems/progress/src/systems/stats.ts` implement an identical pattern: iterate a list of sources (equipment items / applied perks), look up each in a registry, sum additive modifiers, multiply ratio modifiers, return the composed `Stats`. Two consumers → ready for promotion per PLAN.md §5.

**Target:** `forge/src/composition/modifiers.ts`. Signature:

```ts
compose_modifiers<S, Src>(
  base: S,
  sources: ReadonlyArray<Src>,
  resolve: (s: Src) => StatModifier | undefined,
  rules: { additive: ReadonlyArray<keyof S>; multiplicative: ReadonlyArray<keyof S> },
): S;
```

**Best landed in Phase 8 `main`**, which composes both equipment AND perks against the same `Stats` shape. Loot and progress migrate at that point.

---

## 9. Forge promotion candidate: A* + chaser AI

**Not an AGENTS.md addition — a promotion proposal.**

Three subsystems will have copied `astar.ts` + `ai-chaser.ts` + `path-step.ts` + `creature-occupancy.ts` by end of Phase 6 (bestiary, progress, boss). Strongest promotion signal in the repo by then.

**Target:** `forge/src/ai/`. Surface area:

- `astar(grid, start, goal, opts): Result<Path, AStarError>` — already pure, no ECS coupling.
- `make_ai_chaser_system({ paused_r, aggro_radius }): System` — factory with paused-resource injection so each subsystem picks its own gate.
- `make_path_step_system({ paused_r, tile_dt }): System` — same shape.
- `creature_occupancy_r` + `make_creature_occupancy_system(): System` — pre-stage occupancy index.

**Promote at end of Phase 8 `main`**, after `main` has actually composed all three subsystems and the shape stabilises. Until then, the per-subsystem copies are the right call — see PROPOSED-AGENTS-UPDATES §3 above for the convention while they remain duplicated.

---

## Notes for reviewer

- Items 1, 2, 5, 6 are the strongest AGENTS.md candidates — they document failure modes that bit during dev and are not covered by any existing rule. Pair them with the loot/arena merges.
- Item 3 codifies the convention for the ongoing duplication; mostly stops drift between copies.
- Item 4 is subsystem-specific friction — could fold into the existing "Debug fixture pattern" section as a footnote rather than a new rule.
- Items 7, 8, 9 are PLAN.md / forge edits, not AGENTS.md. Surfacing here so the user sees the cumulative promotion case ahead of Phase 8.
