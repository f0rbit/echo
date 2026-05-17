# progress — subsystem plan (Phase 5)

> Status: **shipped (2026-05-18).** All 9 phases landed on `main` in commits `a952109` → `48574fe` plus this docs commit. Sequel to `loot` (Phase 4, shipped 2026-05-17). FRICTION.md is the working-notes companion; PROPOSED-AGENTS-UPDATES.md collects un-merged conventions.
>
> Commit chain: `a952109` (5.0 scaffold) → `369d037` (5.1 perks + Zod) → `a2efc72` (5.2 xp + perks + stats) → `9b6759c` (5.3 chasers + melee) → `d37a97d` (5.4 perk-choice UI + HUD) → `2583c53` (5.5 disk save/load) → `8944f0e` (5.6 replay + disk round-trip tests) → `48574fe` (5.7 debug fixture) → this commit (5.8 docs).
>
> See "Deviations from plan" at the bottom for corrections made during implementation.
>
> Audience: future Claude sessions, future agents, the user. Single source of truth for the `progress` subsystem.
>
> Parents:
> - `~/dev/echo/PLAN.md` §4.5 (subsystem catalogue entry), §5 (forge promotion gates), §7 Phase 5 (LOC table).
> - `~/dev/echo/AGENTS.md` "Rendering conventions" + "Forge API gotchas" (non-negotiable).
> - `~/dev/echo/subsystems/loot/PLAN.md` (canonical "shipped subsystem" plan format — mirror its shape).
> - `~/dev/echo/subsystems/loot/PROPOSED-AGENTS-UPDATES.md` (9 un-merged conventions; items 1–8 relevant — see §11).
> - `~/dev/echo/subsystems/arena/PROPOSED-AGENTS-UPDATES.md` (4 remaining un-merged; combat-specific, only §4 lighting cosmetic-only matters incidentally — see §11).
> - `~/dev/echo/subsystems/loot/FRICTION.md` + `~/dev/echo/subsystems/arena/FRICTION.md`.
>
> Sibling reference. progress mirrors **loot's structural shape** for cell-step subsystems (snapshot + replay + debug fixture) and **adds disk persistence** as the new load-bearing capability. Cell-step + light combat (bestiary-style chasers, single-swing kill) is intentional — see §2 Q1, Q5. No projectiles, no continuous motion.

---

## 1. Goals and non-goals

### Goals

- **Meta-progression pillar.** PLAN.md §4.5 / pillar (implied): "XP, levelling, perks, run save/load."
- **Mechanics scope (per PLAN.md §4.5):**
  - 320×180 single-room arena (same shape as `loot` — boundary walls, no FOV).
  - Weak enemies (chasers) spawn, walk toward the player, die in one swing. **Player melee swing kills on touch.**
  - Killing enemies grants XP. XP threshold per level scales (`100 * level`).
  - On level-up: **pause the game** (hitstop-style game-state gate), show 3 random perks, player picks one. Perk applies a permanent modifier; gameplay resumes.
  - **8 perks reduced to 5 simple stat perks (§2 Q6):** `+atk`, `+def`, `+spd`, `+max_hp`, `+xp_gain_mul`. (PLAN.md §4.5's `multi_shot`, `regen`, `double_swing` defer to Phase 8 `main` where projectiles/health-regen are available.)
  - **Disk save/load.** Game state persists across page reloads via a localStorage-backed store. Auto-save on every level-up + on every kill. Manual save via palette `/save slot-1` and `/load slot-1`.
  - HUD: XP bar (current/threshold), level number, list of acquired perks. Top-right of the canvas, on `app.render.debug_overlay` (loot's stat-panel-hud pattern).
- **Snapshot round-trip is still load-bearing** (mirrors loot Phase 4.5).
- **Disk-restore round-trip is the NEW load-bearing test** for this subsystem. Two tests required: (a) snapshot-in-memory round-trip (same as loot), (b) save-to-disk → reload-page → restore round-trip (new). See §6.
- **Replay-as-test gate.** Mirrors loot/arena/bestiary: `seed=1`, scripted action stream, end-state assertions on `xp_c`, `perks_c`, `stats_c`, world hash. Plus a separate test that loads a recorded disk save and asserts identical state.
- **Debug fixture page.** `subsystems/progress/debug/` deterministically spawns N chasers + 1 player + auto-swing schedule, drives the player to level 3, picks perks, saves, reloads, restores (per AGENTS.md "Debug fixture pattern"; per arena FRICTION.md §9 the `debug.html` script tag references `./main.js` after build-time rename).

### Non-goals

- **Projectiles.** Phase 5 doesn't ship ranged. PLAN.md §4.5 doesn't require it. Perks that need projectiles (`multi_shot`) are explicitly cut (§2 Q6). Continuous motion is required for projectiles; we stay cell-step.
- **HP regen, hitstop, camera shake, particles, light-fx, flash.** Arena owns the hit-feedback stack. progress reuses **none of it** — kills are immediate. Surface this as "loot was cell-step + no enemies; progress is cell-step + 1-swing enemies — same lighting-disabled, no-particles policy."
- **Multiple save slots in v1.** Single named slot `"echo:progress:run"` is enough to prove disk persistence. Multi-slot UI is post-Phase 5.
- **Save versioning migration.** forge's `snapshot_schema` already has `version: z.literal(1)`. v1 progress saves to `version: 1`; a save with `version: 2` from a future schema would fail validation cleanly. Migration tooling (v1→v2 transform) is post-Phase 5. **Do call out the gap explicitly in §4** so a future agent doesn't think we forgot.
- **Real combat depth.** Single-swing kills, fixed-radius melee arc (or "adjacent cell" check), no enemy AI complexity beyond bestiary's chaser pattern. See §2 Q5.
- **FOV / walls / autotile / continuous motion / particles.** All cut (matches loot's non-goals).
- **Real art.** `__default__` atlas; coloured-square sprites.
- **Audio.** Out per PLAN.md OQ-6.
- **Cross-tab save sync, save corruption recovery, save migration UI.** Out for v1. localStorage write is fire-and-forget; corrupt save → silent fallback to "fresh run." Surface friction if it bites.

---

## 2. Design questions resolved (with rationale)

### Q1. Cell-step vs continuous motion

PLAN.md §4.5 doesn't specify. loot went cell-step; bestiary is cell-step; arena is continuous. progress reuses **bestiary's chaser AI pattern** (cell-step, A* pathfinding toward player) and **loot's cell-step player movement**.

**Decision: cell-step.**

**Rationale:**
- No projectiles → no continuous-position requirement.
- Bestiary's chaser AI is cell-step; reusing it is cheap (copy ~50 LOC chaser.ts + ~54 LOC path-step.ts).
- Loot proved cell-step + snapshot round-trip is byte-stable. Same pattern here, plus disk write/read on top.
- Combat is "adjacent cell" — no arc geometry. Player faces a direction; pressing Z kills the chaser in the cell directly in front. Trivial.

**Consequence:** progress is the **third cell-step echo subsystem** (after bestiary, loot). Strengthens the case for promoting the "pick a motion model at scaffold time" rule into AGENTS.md (loot's PROPOSED-AGENTS-UPDATES.md §6 already calls this out).

### Q2. Where does combat come from?

PLAN.md §4.5 says "weak enemies that grant XP on kill." No detail on how the player kills them.

**Options weighed:**
- **(a) Reuse arena's `combat-melee.ts` verbatim.** Continuous-motion. Wrong — we're cell-step.
- **(b) Reuse arena's combat-feel stack (hitstop + particles + camera shake + flash).** Way too much for "kills weak enemy on touch." Arena ships ~600 LOC of feedback. Out.
- **(c) Stationary punching-bag enemies that die when player walks adjacent.** Simplest. Demonstrates XP gain. No enemy AI.
- **(d) Bestiary's cell-step chasers (copy ~150 LOC AI) + a 1-tile melee swing (~30 LOC new).** Slightly larger, but enemies that move feel like a game, not a punching bag.

**Decision: (d) — bestiary chaser AI copied + minimal 1-tile melee.**

**Rationale:**
- ~180 LOC duplication from bestiary is the third copy of cell-step chaser AI (after bestiary itself and `boss` Phase 6 will copy it too). **3+ copies tripped by Phase 5 → strong Phase 8 forge-promotion signal.** Annotate the copied files with a `// FORGE-PROMOTION-CANDIDATE: cell-step chaser AI + A* — third copy (bestiary, progress, boss-to-come).` comment.
- Melee swing in cell-step: a 1-tile "swing in facing direction" check. Player has `dir_c` (facing persistence from bestiary's pattern); `Z` press kills the chaser in `pos + dir` if any. ~30 LOC.
- No projectiles, no arc geometry, no hitstop, no particles — single instant kill. **The kill is the XP source; the kill is the only combat surface.**

**Consequence:**
- Per AGENTS.md "no `@echo/shared`": we COPY ~180 LOC from bestiary (`ai/chaser.ts`, `ai/path-step.ts`, plus `creature_occupancy` + `wall_index` resource shapes). Annotate as duplications.
- Enemies have `hp_c: { current: 1, max: 1 }` (1 hp; one swing kills). Future-proof if we want tougher enemies post-Phase 5 — `hp_c` survives snapshot.

### Q3. Stat composition — perks + base + (no equipment)

Loot's `compute_stats(base, equipment, registry)` is pure and lives in loot. **Cross-subsystem import is forbidden** per AGENTS.md "no `@echo/shared`."

**Decision: progress ships its OWN `compute_stats(base, perks, registry)` module — independent of loot's.**

**Rationale:**
- Progress's composition source is **perks**, not equipment. The shape differs:
  - Loot: `compute_stats(base, equipment: { weapon, offhand, ring1, ring2 }, registry)` — iterates 4 equipment slots, looks up each item's modifier.
  - Progress: `compute_stats(base, perks: { applied: PerkId[] }, registry)` — iterates an applied perk list, looks up each perk's modifier.
- The composition rules are the **same** (additive on absolute counts, multiplicative on ratios). The data source differs.
- Phase 8 `main` will unify them — that's the right place to extract a shared `compose_modifiers` helper. PLAN.md §5 says wait for 2+ subsystems before promoting; progress is the second consumer, so this becomes a **promotion candidate flagged in §11**.

**Implementation. ** Mirror loot's `compose_modifiers` precisely:
```ts
type StatModifier = {
  atk?: number;          // additive
  def?: number;          // additive
  hp?: number;           // additive (max-hp delta)
  spd_mul?: number;      // multiplicative (1.1 = +10%)
  xp_gain_mul?: number;  // multiplicative (perk-only; loot doesn't have this)
};
type PerkDef = {
  id: PerkId;
  name: string;
  modifier: StatModifier;
};
const compute_stats = (base: Stats, perks: PerkApplied, registry: PerkRegistry): Stats => { ... };
```

`xp_gain_mul` is a perk-only stat — loot doesn't have it, progress does. Composition reuses the multiplicative pattern. No shared code import; pattern is duplicated. **Annotated as forge-promotion candidate.**

### Q4. Level-up state machine — pause-and-pick mechanism

When player kills enough enemies to cross an XP threshold:

1. `xp_c.current` is increased on the kill tick.
2. After increase, check: `xp_c.current >= threshold_for(xp_c.level + 1)`. If yes, fire a level-up.
3. Level-up: increment `xp_c.level`, subtract the threshold from `xp_c.current` (overflow carries to next level), generate 3 random perk choices, **set `progress_r.paused = true`**, write choices to `level_up_pending_r.choices`.
4. While `progress_r.paused === true`, **every gameplay system early-returns** (mirrors arena's hitstop gate — see §2 Q9 below). Render-stage systems keep ticking (HUD shows the perk-choice overlay).
5. Player presses `1` / `2` / `3` (or clicks): the chosen perk is appended to `perks_c.applied`, `progress_r.paused = false`, `level_up_pending_r.choices = []`. The next tick resumes gameplay; `stats_recompute_system` reads the new `perks_c` and updates `stats_c`.

**This is the SECOND use of the "game-state gate" pattern in echo** (arena's `hitstop_r.remaining > 0` was the first). Both pause gameplay while letting render keep going. **Strong AGENTS.md proposal in §11.**

**Decision: `progress_r.paused: boolean` is a single-bit gate. Every gameplay system early-returns when `paused === true`.** No `time.scale` mutation (per arena's hitstop friction §1 / arena PROPOSED-AGENTS-UPDATES.md §1).

Replay determinism: `time.tick` advances even while paused. The perk-pick action (`pick_perk_0..2` digital bindings) is recorded as a normal replay event. Replays survive pause perfectly.

### Q5. Enemy spawn cadence + density

PLAN.md §4.5 doesn't specify. Need: enough enemies to grant XP in a reasonable replay window.

**Decision:**
- **Spawn cadence:** 1 chaser every 60 ticks (1 second at 60fps), capped at 4 simultaneous chasers on screen.
- **Spawn locations:** randomly from a fixed pool of 8 spawn cells along the arena edges (sorted, seeded pick).
- **XP per kill:** 25 base, multiplied by `(1 + xp_gain_mul)` from perks.
- **Level thresholds:** `level 1 → 2` requires 100 XP; `2 → 3` requires 200; `3 → 4` requires 300; etc.

With 4 kills/level × 3 levels = 12 kills target. At spawn-cap 4 + 60-tick cadence + kill-time of ~30 ticks per chaser, expect ~360–480 tick replay = 6–8 seconds. Well within bun-test timeout. (loot's replay is 158 ticks; progress will be ~3× longer — still under the 30s override.)

### Q6. Perk pool — 8 from PLAN.md or simpler?

PLAN.md §4.5 says "8 perk types." Reality: some need new combat mechanics that don't exist in this subsystem.

**Decision: ship 5 stat-modifier perks. Cut 3 that need new mechanics.**

| # | Perk id | Name | Modifier | Status |
|---|---|---|---|---|
| 1 | `perk.atk_plus` | Sharpened Blade | `{ atk: +3 }` | shipped |
| 2 | `perk.def_plus` | Hardened Hide | `{ def: +2 }` | shipped |
| 3 | `perk.spd_plus` | Swift Step | `{ spd_mul: +0.15 }` | shipped |
| 4 | `perk.hp_plus` | Iron Heart | `{ hp: +5 }` (max-hp; current-hp also bumped) | shipped |
| 5 | `perk.xp_gain` | Quick Learner | `{ xp_gain_mul: +0.25 }` | shipped |
| 6 | ~~`perk.multi_shot`~~ | ~~Triple Shot~~ | needs projectiles → cut (no ranged in progress) |
| 7 | ~~`perk.regen`~~ | ~~Regeneration~~ | needs `hp_regen_system` + tick-based heal → cut for simplicity |
| 8 | ~~`perk.double_swing`~~ | ~~Double Swing~~ | needs swing-cooldown system → cut |

The 5 shipped perks all compose cleanly with `compute_stats`. The 3 cut perks are explicitly listed so PLAN.md §4.5 doesn't read as "we forgot." Phase 8 `main` is the right place to re-add them once combat is unified.

**Random selection at level-up:** seeded RNG fork from `ctx.rng`, draw 3 distinct ids from the pool of 5. If `applied` already contains a perk, **still allow re-picking it** (stacking is allowed in v1; cap to 3 stacks per perk). Simpler than "uniqueness across applied set"; allows interesting builds.

### Q7. Inventory? Equipment?

**Decision: NO inventory, NO equipment.** Per AGENTS.md "no `@echo/shared`": don't import loot's inventory module. Per PLAN.md §4.5: progress is about XP+perks; equipment is loot's pillar.

`stats_c` is computed from `base + perks_c.applied`. No `equipment_c`, no `inventory_c`, no `pickup_c`. Phase 8 unifies the two.

### Q8. Save trigger — when does the disk write fire?

PLAN.md §4.5 mentions "auto-save every 30s." But disk persistence is the core demo; save events should be tied to player-meaningful moments.

**Decision (final):**
- **Auto-save on every level-up** — fires after the player picks a perk, before the pause clears.
- **Auto-save on every kill** — fires after `xp_c.current` is incremented (and AFTER the level-up branch, if any).
- **Manual save via palette `/save`** — writes immediately.
- **Manual load via palette `/load`** — reads the slot and calls `snapper.restore`.
- **No interval-based auto-save** (no `setInterval` outside `src/pixi/` per forge determinism contract). All saves are tick-aligned.

**Frequency analysis:** ~12 kills + ~3 level-ups per minute = ~15 writes/minute. localStorage write is synchronous in browser and ~1ms for a small snapshot. Should not stutter. **If it does, add a "save dirty-flag with `post`-stage flush every N ticks" mitigation; flag in FRICTION.md if it bites.**

**Replay note.** Disk writes during replay are tested explicitly:
- The recorder runs save-on-kill but writes to a `mem({ schema: snapshot_schema })` test store, not localStorage. Same Store interface.
- Replay tests use `mem` as well. localStorage is browser-only; tests never touch it. The `localstorage_store()` factory is wired only in `main.ts`.

### Q9. Pause mechanism — `progress_r.paused` game-state gate (NOT `time.scale = 0`)

Arena's hitstop friction §1: `time.scale = 0` deadlocks the schedule. **DON'T do it here either.**

**Decision: `progress_r.paused: boolean` resource flag. Every gameplay system early-returns when `true`.**

```ts
// pattern for every gameplay system (xp, kill, ai, swing, movement)
const movement_system: System = (w, ctx) => {
  const r = ctx.res.get(progress_r);
  if (r.ok && r.value.paused) return;
  // ... normal logic
};
```

Render-stage systems (perk choice overlay, HUD, entity-render) keep ticking — they need to render the pause screen.

The pick-perk input system runs in `pre` stage and DOES NOT gate on `paused` — it's the only thing that can unpause.

**This is the SECOND use of the pattern in echo.** Pattern proposal in §11.

### Q10. Snapshot scope — what's serialized

Following loot's pattern (snapshot loot/src/snapshot.ts):

**Registered for snapshot:**

| Surface | Registered? | Schema | Reason |
|---|---|---|---|
| `pos_c` | yes | `{x, y}` | Player + chaser positions |
| `visual_pos_c` | yes | `{x, y}` | Tween smoothing (cell-step) |
| `dir_c` | yes | `{ dx, dy }` | Player facing — used by melee swing |
| `player_c` | yes | marker | Tag |
| `chaser_c` | yes | marker | Tag |
| `state_c` | yes | `{ kind, aggro_radius }` | AI state survives restore |
| `path_c` | yes | `{ cells, index }` | Mid-pathfinding state |
| `hp_c` | yes | `{ current, max }` | Player + chaser HP |
| `xp_c` | yes | `{ current, level }` | Core demo state |
| `perks_c` | yes | `{ applied: PerkId[] }` | Core demo state |
| `stats_c` | yes | `{ atk, def, spd, hp }` (max-hp denormalized in stats) | Derived but cheap to snapshot |
| `arena_r` | yes | (matches loot) | World gen state |
| `run_seed_r` | yes | `{ base, restart_count }` | Determinism + restart |
| `progress_r` | yes | `{ paused: boolean, last_save_tick: number }` | Pause state survives restore (so a save-mid-level-up restores into a pause) |
| `level_up_pending_r` | yes | `{ choices: PerkId[] }` | If you save mid-pick, you reload mid-pick |
| `creature_occupancy_r` | **NO** | — | Derived from positions; rebuilt by `creature_occupancy_system` on next tick. (Bestiary's pattern.) |
| `wall_index_r` | **NO** | — | Derived from wall entities; trivially zero here (no walls). |
| `perk_registry_r` | **NO** | — | Static config, rehydrated by `setup_progress` startup system (mirrors loot's `item_registry_r`). |
| `xp_threshold_curve` | **NO** | — | Pure function, not a resource. |

**Pattern carryover from loot:**
- Static config (registry) NOT snapshotted, rehydrated by startup → loot FRICTION.md §3 / PROPOSED-AGENTS-UPDATES.md §3.
- Transient state (e.g. perk-pick click queue) lives in factory closures → loot FRICTION.md §4 / PROPOSED-AGENTS-UPDATES.md §4.
- World hash projection needs canonical-stringify → loot FRICTION.md §1 / PROPOSED-AGENTS-UPDATES.md §1.
- `Snapshotter.restore()` clears the world destructively → loot FRICTION.md §2 / PROPOSED-AGENTS-UPDATES.md §2.

**Disk-save delta from loot:** the snapshot is **the same shape**. Disk save adds a localStorage round-trip on top — `JSON.stringify(snapshot)` → localStorage → `JSON.parse` → `snapshot_schema.safeParse` → `snapper.restore`. **No new bytes in the snapshot; just a different transport.**

### Q11. Disk save format — localStorage key + shape

**Decision:**
- Key: `"echo:progress:save:slot-1"`.
- Value: `JSON.stringify(snapshot)` (the `Snapshot` object from `make_progress_snapshotter().take(w, opts).value`).
- Schema validation: on load, `snapshot_schema.safeParse(JSON.parse(raw))` — forge's existing schema already has `version: z.literal(1)` baked in (§4).
- Save size: estimated ~2–5 KB for a typical run (12 chasers + player + perks list + resources). Well under localStorage's 5–10 MB per-origin limit (§4).

**No compression for v1.** If a future deep run pushes size to 100+ KB (still <2% of limit), still no compression. If it ever exceeds 1 MB (we expect never in this subsystem), revisit.

**Slot naming:** single fixed slot `"slot-1"` for v1. Multi-slot palette command (`/save slot-2`, `/load slot-2`) is wired but UI exposes only slot-1.

### Q12. Disk save trigger — direct localStorage or via corpus Store?

forge ships `mem` and `file` Store implementations (forge/src/storage/{mem.ts, file.ts}). **There is NO localStorage Store backend in forge v0.4.3.** See §4 gap analysis.

**Options:**
- **(a) Game-side localStorage store.** Build a minimal `localstorage_store(opts: { schema, key_prefix }): Store<T>` that implements the `Store<T>` interface (forge/src/storage/types.ts). Uses the corpus `Store` shape so `forge.save()` / `forge.load()` helpers work unchanged. Game-side until forge-promoted.
- **(b) Bypass corpus, write `JSON.stringify(snapshot)` directly.** Skip the `Store<T>` abstraction. Write/read are 5-line functions. Validates with `snapshot_schema.safeParse` on load. Simpler.

**Decision: (b) for v1 — direct localStorage with `snapshot_schema.safeParse`.**

**Rationale:**
- The corpus `Store<T>` interface assumes content-addressed storage (snapshots get content hashes, parents linked via `SaveHandle.parent`). For progress's single-slot use case, the parent chain is overkill. We get version (forge already validates `version: z.literal(1)`) without the corpus chain.
- ~30 LOC vs ~150 LOC for a full Store impl. Half the surface area; half the friction.
- forge promotion (option a) is **the right shape for phase 7 `hub`** (which will also need localStorage). When `hub` lands, two consumers → promote `localstorage_store()` into `forge/storage/`. Annotate the simple game-side helper as a **promotion candidate**.

**Implementation:**
```ts
// src/disk-save.ts (game-side, ~30 LOC)
import { snapshot_schema, type Snapshot } from "@f0rbit/forge";
import { err, ok, type Result } from "@f0rbit/corpus";

const KEY = "echo:progress:save:slot-1";

export type DiskError =
  | { kind: "no_save" }
  | { kind: "parse" ; cause: string }
  | { kind: "schema_validation"; issues: readonly string[] }
  | { kind: "browser_storage_unavailable" };

export const disk_save = (s: Snapshot): Result<void, DiskError> => {
  if (typeof localStorage === "undefined") return err({ kind: "browser_storage_unavailable" });
  try { localStorage.setItem(KEY, JSON.stringify(s)); return ok(undefined); }
  catch (e) { return err({ kind: "browser_storage_unavailable" }); }
};

export const disk_load = (): Result<Snapshot, DiskError> => {
  if (typeof localStorage === "undefined") return err({ kind: "browser_storage_unavailable" });
  const raw = localStorage.getItem(KEY);
  if (raw === null) return err({ kind: "no_save" });
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch (e) { return err({ kind: "parse", cause: (e as Error).message }); }
  const validated = snapshot_schema.safeParse(parsed);
  if (!validated.success) return err({ kind: "schema_validation", issues: validated.error.issues.map(i => i.message) });
  return ok(validated.data);
};
```

The single try/catch wraps the foreign `localStorage` API call (per `~/.claude/AGENTS.md` "permitted try/catch site"). All other surfaces use Result<T, E>.

**Save versioning.** forge's `snapshot_schema` is `z.object({ version: z.literal(1), ... })`. A save from a future version with `version: 2` fails `safeParse` cleanly → `{ kind: "schema_validation" }`. No migration; we just discard the old save and start fresh. **The slot is keyed by version-naive key (`slot-1`), but if a future progress build bumps to `version: 2`, the OLD save still in localStorage will fail validation cleanly → `disk_load()` returns `{ kind: "schema_validation" }` → main.ts treats it as "no save" → fresh run.** No code change needed for v2; gracefully forwards-compatible.

### Q13. Lighting

Same as loot Q8 — **no lighting filter.** Saves ~80 LOC. progress has no fancy combat feedback (no flashes, no hit-glow), so the lighting filter has nothing to do. Eye-light + ambient `(1,1,1)` (arena's pattern for cosmetic-only) is unnecessary because there's no cosmetic on top.

### Q14. Where the registry lookups happen

Same as loot Q11. `perk_registry_r` is set up by `setup_progress` (startup) before any system needs it. Systems read via `ctx.res.get(perk_registry_r)`. Registry is **NOT snapshotted** (per Q10).

For replay/disk-load tests: the test harness runs `game_plugin(h.world, h.schedule)`, which queues `setup_progress` in `startup` stage. The harness `tick()` only runs `update` stage (per loot FRICTION.md §11). **So test fixtures must seed the registry manually** OR run a wrapper `boot_tick()` that fires startup once before `restore`. See `loot/test/replay.test.ts:make_restore_target` for the pattern; reuse identically.

### Q15. Synthetic perk-pick click bindings (replay-stable)

Mirrors loot's synthetic slot-click bindings (loot/PROPOSED-AGENTS-UPDATES.md §7).

**Decision:** wire `pick_perk_0`, `pick_perk_1`, `pick_perk_2` as digital action bindings on keys `1`, `2`, `3` (real player UX). The DOM `pointerdown` handler for the perk-choice overlay also calls a `queue_perk_pick(idx)` closure-local setter via the same factory pattern as loot's `make_inventory_system`. Replay-player consumes the actions verbatim; the DOM path is browser-only.

**Recorder bridge:** `record-level-and-save.ts` emits the digital action at the scripted tick. No replay-schema change.

### Q16. World-hash projection vs disk-save round-trip

**TWO determinism tests are required:**

1. **In-memory snapshot round-trip** (mirrors loot/test/replay.test.ts §6):
   - `snap = snapper.take(w, { time, rng, res })` (no JSON in-between).
   - `snapper.restore(w2, snap, ...)`.
   - Assert `world_hash(w) === world_hash(w2)` (canonical-stringify; per loot FRICTION.md §1).

2. **Disk save round-trip** (NEW for progress):
   - `snap = snapper.take(...)`.
   - `raw = JSON.stringify(snap)`.
   - `snap2 = JSON.parse(raw)`.
   - `validated = snapshot_schema.safeParse(snap2)` — must succeed.
   - `snapper.restore(w2, validated.data, ...)`.
   - Assert `world_hash(w) === world_hash(w2)`.
   - Plus: assert `raw === JSON.stringify(snap2_after_parse)` is **NOT** required (JSON round-trip preserves values, not whitespace). The world-hash equality is the load-bearing assertion.

Both tests reuse the canonical-stringify projection helper from loot. **COPY loot's projection helper into progress** (per AGENTS.md "no `@echo/shared`"). Annotate as a forge-promotion candidate (`canonical_stringify` is generic; should move to forge/test-helpers in Phase 8).

---

## 3. File-level scope

Mirrors loot's package shape exactly. **Forge stays on `^0.4.3`** — no forge bump expected for progress (§4).

```
~/dev/echo/subsystems/progress/
├── package.json                    # @f0rbit/forge@^0.4.3 (matches loot)
├── tsconfig.json                   # extends echo root; alias @pr/*
├── index.html                      # mirror of loot/index.html
├── debug.html                      # debug fixture entry HTML
├── FRICTION.md                     # subsystem-specific friction log (post-ship)
├── PLAN.md                         # promoted from this file at Phase 5.8
├── PROPOSED-AGENTS-UPDATES.md      # new conventions surfaced
├── public/
│   └── (no atlases — coloured-square __default__ frames)
├── src/
│   ├── components.ts               # ~80 LOC — player_c, chaser_c, hp_c, xp_c, perks_c, stats_c,
│   │                               #          state_c, path_c, dir_c, visual_pos_c
│   ├── resources.ts                # ~70 LOC — arena_r, run_seed_r, perk_registry_r,
│   │                               #          creature_occupancy_r, wall_index_r (empty),
│   │                               #          progress_r, level_up_pending_r
│   ├── bindings.ts                 # ~30 LOC — WASD/arrow + Z swing + 1/2/3 pick_perk +
│   │                               #          R restart + Tab debug + (S manual /save, L /load
│   │                               #          via palette only)
│   ├── grid.ts                     # ~5 LOC  — g = grid({ cols: 20, rows: 11, tile: 16 })
│   ├── astar.ts                    # ~120 LOC — A* pathfinder, COPIED from bestiary/src/astar.ts.
│   │                               #          Annotated as FORGE-PROMOTION-CANDIDATE.
│   ├── arena-gen.ts                # ~100 LOC — startup: spawn player + background rect +
│   │                               #          init perk_registry_r + initial empty enemy slots
│   ├── plugin.ts                   # ~100 LOC — game_plugin(world, schedule, opts)
│   ├── snapshot.ts                 # ~50 LOC — make_progress_snapshotter() factory
│   ├── disk-save.ts                # ~40 LOC — localStorage save/load with Result + Zod validate
│   ├── palette-cmds.ts             # ~60 LOC — register /save, /load, /perk-list, /grant-xp,
│   │                               #          /kill-all commands
│   ├── main.ts                     # ~120 LOC — boot wiring, perk-choice UI install,
│   │                               #          auto-load-on-boot if disk save exists
│   ├── main-debug.ts               # ~80 LOC — debug fixture entry (companion to main.ts)
│   ├── debug-plugin.ts             # ~100 LOC — stripped plugin: scripted spawns + auto-swing
│   │                               #          + auto-pick perk @ each level-up
│   ├── data/
│   │   ├── perks.ts                # ~100 LOC — 5 PerkDef literals + make_perk_registry()
│   │   └── schemas.ts              # ~120 LOC — Zod schemas for every snapshot-registered surface
│   └── systems/
│       ├── input.ts                # ~60 LOC — reads movement + Z swing + 1/2/3 pick_perk +
│       │                           #          R restart + S/L palette already covers save/load
│       ├── movement.ts             # ~50 LOC — cell-step (mirrors bestiary; gates on
│       │                           #          progress_r.paused)
│       ├── tween.ts                # ~40 LOC — copy of loot/tween.ts (visual_pos lerp;
│       │                           #          NOT gated on paused — visual catches up smoothly)
│       ├── melee-swing.ts          # ~80 LOC — Z press: kill adjacent chaser in dir_c;
│       │                           #          emit xp_gain event
│       ├── xp.ts                   # ~100 LOC — consume xp_gain events; bump xp_c.current;
│       │                           #          if threshold crossed, fire level_up: set
│       │                           #          progress_r.paused, populate level_up_pending_r;
│       │                           #          all gated on progress_r.paused EXCEPT the
│       │                           #          pick-perk consumer
│       ├── perks.ts                # ~80 LOC — consume queue_perk_pick events; append to
│       │                           #          perks_c.applied; clear pending; clear paused;
│       │                           #          mark dirty_stats
│       ├── stats.ts                # ~80 LOC — compute_stats(base, perks_c, registry);
│       │                           #          recompute system reads progress_r.dirty_stats
│       ├── ai-chaser.ts            # ~60 LOC — COPIED from bestiary/src/systems/ai/chaser.ts.
│       │                           #          Gates on progress_r.paused. Annotated as
│       │                           #          FORGE-PROMOTION-CANDIDATE.
│       ├── path-step.ts            # ~60 LOC — COPIED from bestiary/src/systems/ai/path-step.ts.
│       │                           #          Annotated.
│       ├── enemy-spawn.ts          # ~80 LOC — spawn 1 chaser every 60 ticks, cap 4; seeded
│       │                           #          spawn-cell pick from pool
│       ├── creature-occupancy.ts   # ~50 LOC — COPIED from bestiary; tracks occupied cells per tick
│       ├── auto-save.ts            # ~60 LOC — post-stage system: if any kill or level-up
│       │                           #          fired this tick, fire disk_save(snapper.take(...))
│       ├── perk-choice-ui.ts       # ~150 LOC — Pixi Container overlay on app.stage; 3 perk
│       │                           #          buttons; 1/2/3 keyboard or click; mirrors
│       │                           #          loot/inventory-ui.ts viewport pattern
│       ├── hud.ts                  # ~80 LOC — top-right XP bar + level number + applied
│       │                           #          perks list (mirrors loot/stat-panel-hud)
│       ├── synthetic-perk-pick.ts  # ~40 LOC — replay-bridge: reads pick_perk_0..2 actions
│       │                           #          and calls perks_sys.queue_perk_pick(idx)
│       ├── restart.ts              # ~50 LOC — R: world.clear() + arena-gen re-run +
│       │                           #          reset progress_r + clear disk save
│       ├── entity-render.ts        # ~60 LOC — copy loot pattern; player + chasers +
│       │                           #          colour-square sprites
│       └── sprite-attach.ts        # ~30 LOC — copy bestiary pattern
├── replays/
│   └── level-and-save.replay.json  # scripted: kill 4 chasers → level up → pick perk_0 →
│   │                               #          kill 4 chasers → level up → pick perk_1 →
│   │                               #          kill 4 chasers → level up → pick perk_2 →
│   │                               #          snapshot mid-replay → restore → continue
├── test/
│   ├── replay.test.ts              # ~250 LOC — full replay incl. mid-replay snap+restore +
│   │                               #          end-state assertions
│   ├── snapshot.test.ts            # ~180 LOC — focused snapshot round-trip unit tests
│   ├── disk-save.test.ts           # ~150 LOC — NEW: localStorage round-trip; missing-save +
│   │                               #          schema-mismatch + future-version cases
│   ├── xp-level.test.ts            # ~120 LOC — XP threshold math; multi-level-up; xp_gain_mul
│   ├── perks.test.ts               # ~100 LOC — compose math; perk stacking; ring-N policy
│   ├── stats.test.ts               # ~100 LOC — compose with mock perks; additive +
│   │                               #          multiplicative; xp_gain_mul
│   ├── ai-chaser.test.ts           # ~80 LOC  — A* path step; pursuit gate; aggro radius
│   ├── perk-choice-ui.test.ts      # ~80 LOC  — hit-test math (mirrors loot/inventory-ui.test)
│   └── fixtures/
│       └── progress-scenario.ts    # deterministic test-world builders + registry helpers
└── tools/
    └── record-level-and-save.ts    # ~150 LOC — record the canonical replay
```

### Forge-side

**None.** Snapshot, `event_to_world`, lighting (unused), grid all exist in `@f0rbit/forge@0.4.3`. See §4 for the gap analysis (localStorage Store is the candidate; held game-side).

---

## 4. Forge stress points — what exists, what's new

### What exists in forge v0.4.3 (no work needed)

| Surface | Path | Used by progress |
|---|---|---|
| `snapshotter()` + `.register` + `.register_resource` + `.take` + `.restore` | `forge/src/snapshot.ts` | **Load-bearing.** Mirrors loot's usage. |
| `snapshot_schema` (with `version: z.literal(1)` baked in) | `forge/src/snapshot.ts:21–26` | **Load-bearing.** Disk save validation. |
| `harness` | `forge/src/harness.ts` | Replay-as-test (same as loot). |
| `replay.record / play / load / replay_schema` | `forge/src/replay.ts` | Replay-as-test (same as loot). |
| `event_to_world(e, canvas, cam)` | `forge/src/pixi/coords.ts` | Perk-choice click hit-testing. |
| `@f0rbit/forge/grid` g.move_tile / g.in_bounds / g.world_to_cell / g.cell_to_world / g.line_of_sight / g.chebyshev | `forge/src/grid/` | Cell-step + chaser AI (copied from bestiary, uses these). |
| `pos_c`, `dir_c`, `visual_pos_c` from bestiary's exports (and forge's index) | `forge/src/index.ts` | Cell-step. |
| `palette` | `forge/src/palette/` | `/save`, `/load`, `/grant-xp`, `/perk-list`, `/kill-all`. |
| `world.spawn / despawn / spawn_at / query / clear` | `forge/src/world.ts` | Standard ECS. |
| `app.render.debug_overlay` (unfiltered) | `forge/src/pixi/render.ts` | XP / level / perk HUD. |
| `app.stage` (sibling install for perk-choice modal) | `forge/src/pixi/index.ts` | Per loot Q4 + PROPOSED-AGENTS-UPDATES.md §5. |

### Gap analysis

**1. No browser localStorage backend in forge v0.4.3.** `forge/src/storage/` ships `mem` (in-process) and `file` (Node fs) only. The corpus `Backend` types include `memory`, `file`, `cloudflare`, `layered` — no browser-localStorage.

**Decision (§2 Q12):** ship a 30-LOC game-side `disk-save.ts` that bypasses corpus and writes `JSON.stringify(snapshot)` directly to localStorage. The `Store<T>` abstraction is overkill for single-slot use.

**Forge promotion candidate (held until Phase 7 `hub` confirms second consumer):**
- Add `create_localstorage_backend()` to `forge/src/storage/` mirroring `create_file_backend` from corpus.
- Add `localstorage` to `forge.storage`'s exports.
- Game code then uses `engine_store({ backend: "localstorage" })` exactly like Node uses `engine_store({ backend: "file", dir })`.
- **2 consumers (progress + hub) triggers the promotion** per PLAN.md §5. Hub Phase 7 will need the same. **Recommendation: promote at end of Phase 7, ship as forge v0.4.x patch.**

**2. No snapshot-version mismatch friendliness.** forge's `snapshot.restore` returns `{ kind: "snapshot_version_mismatch", expected: 1, got: N }` cleanly (per forge/src/snapshot.ts:135). No work needed; `disk_load()` translates this into `{ kind: "schema_validation" }` via `snapshot_schema.safeParse`. Good as-is.

**3. No snapshot migration tooling.** When `version` bumps from 1 to 2, old saves fail validation. **Out of scope for v1.** When/if forge bumps the schema (and PLAN.md §5 says forge minors are tolerated per-subsystem), we'd want a `migrations: Record<Version, (old) => new>` helper. **Not blocking; flagged for forge v0.6+.**

**4. Cross-subsystem stat composition.** Loot has `compute_stats(base, equipment, registry)`. Progress has `compute_stats(base, perks, registry)`. Both follow the same additive/multiplicative rules. **AGENTS.md forbids `@echo/shared`** → progress copies the composition pattern. This is **the second copy of compose-modifiers semantics.** Per PLAN.md §5: 2+ subsystems = strong promotion signal. **Annotate as forge-promotion candidate for Phase 8 `main` integration.** Don't ship in this phase.

### Forge promotion candidates surfaced (record only, do not promote)

| # | Candidate | Strength | Notes |
|---|---|---|---|
| 1 | `create_localstorage_backend()` + `engine_store({ backend: "localstorage" })` | **Medium → High.** 1 consumer in progress; phase 7 `hub` will be the second consumer. **Promote at end of Phase 7.** | Adds ~80 LOC to forge/storage/. |
| 2 | `compose_modifiers(base, sources: Source[], rules)` helper | Medium. 2 consumers (loot + progress) with same shape. | Right place to land in Phase 8 `main` since main composes both. Hold game-side until then. |
| 3 | `astar(grid, start, end, opts)` | Medium. 3+ consumers (bestiary, progress, boss-to-come). | **Strong** Phase 8 promotion. Already flagged by PLAN.md §5 row Phase 2. |
| 4 | Cell-step chaser AI (`ai_chaser_system`) | Low. Too game-specific. | Drop unless boss needs identical shape. |
| 5 | `canonical_stringify` test helper | Medium. 2 consumers (loot + progress). | Right place is `forge/test/helpers/` (not the published surface). |
| 6 | "Game-state gate" pattern (resource-bag boolean + early-return) | Pattern, not code. | AGENTS.md proposal in §11; no forge code change. |

**Forge change in this phase: none.** progress's `package.json` is at `@f0rbit/forge@0.4.3` (matches loot). Drift policy per PLAN.md §5.

---

## 5. Phasing

Each phase ends with verification (typecheck + test + lint) and an atomic commit. **Per arena FRICTION.md §6 + loot Phase 5 decision:** worktree base-ref unreliable for short phases. Every progress phase runs **sequential single-coder**. No worktrees.

This is a deliberate divergence from arena's plan structure (matches loot's). progress's phases are 200–500 LOC each; coordination cost > parallel speedup at this size.

### Phase 5.0 — Subsystem scaffold (sequential) — **shipped `a952109`**

Single `coder` (not `coder-fast`); scaffold is load-bearing.

| Task | LOC | Files |
|---|---|---|
| `subsystems/progress/package.json` + `tsconfig.json` + `index.html` + `debug.html` + `.gitignore` | ~80 | subsystems/progress/* |
| `src/components.ts` — components per §3 | ~80 | subsystems/progress/src/components.ts |
| `src/resources.ts` — resources per §3 | ~70 | subsystems/progress/src/resources.ts |
| `src/bindings.ts` — movement + Z swing + 1/2/3 pick_perk + R restart + Tab debug | ~30 | subsystems/progress/src/bindings.ts |
| `src/grid.ts` | ~5 | subsystems/progress/src/grid.ts |
| `test/fixtures/progress-scenario.ts` — helpers (make_test_world, make_test_registry, make_restore_target) | ~100 | subsystems/progress/test/fixtures/ |
| Verify `bun --filter progress typecheck` passes with empty plugin | 0 | (verification) |

**Deliverable.** Empty subsystem typechecks; folder structure exists. Wire root `bun --filter '*' build` to detect progress (auto via workspaces).

**LOC total.** ~365.

**Verification commit.** `feat(progress): scaffold subsystem`.

### Phase 5.1 — Perks registry + XP curve + Zod schemas (sequential) — **shipped `369d037`**

| Task | LOC | Files |
|---|---|---|
| `src/data/perks.ts` — 5 PerkDef literals (`atk_plus`, `def_plus`, `spd_plus`, `hp_plus`, `xp_gain`) + `make_perk_registry()` | ~100 | subsystems/progress/src/data/perks.ts |
| `src/data/schemas.ts` — Zod schemas for every snapshot-registered surface (per §2 Q10) | ~120 | subsystems/progress/src/data/schemas.ts |
| XP threshold curve: `xp_threshold(level: number): number` pure function (level 1→2 = 100, etc.) | ~30 | inline in src/data/perks.ts or src/xp-curve.ts |
| Sanity test: every PerkDef passes its own Zod schema; XP curve monotonic | ~60 | subsystems/progress/test/perks.test.ts (new) |

**Deliverable.** `data/perks.ts` exports `PERKS: ReadonlyArray<PerkDef>` and `make_perk_registry(): PerkRegistry`. Curve and registry validate.

**LOC total.** ~310.

**Verification commit.** `feat(progress): perk registry + XP curve + Zod schemas`.

### Phase 5.2 — XP + level-up state machine + stats compose (sequential) — **shipped `a2efc72`**

| Task | LOC | Files |
|---|---|---|
| `src/systems/xp.ts` — xp_gain event consumer; threshold check; level-up branch | ~100 | subsystems/progress/src/systems/xp.ts |
| `src/systems/perks.ts` — perk-pick consumer; append to perks_c.applied; clear pending | ~80 | subsystems/progress/src/systems/perks.ts |
| `src/systems/stats.ts` — `compute_stats(base, perks_c, registry)` pure fn + recompute system | ~80 | subsystems/progress/src/systems/stats.ts |
| `test/xp-level.test.ts` — XP threshold math; multi-level-up; overflow carry | ~120 | subsystems/progress/test/xp-level.test.ts |
| `test/perks.test.ts` — compose math; perk stacking; pause-clear semantics | ~100 | subsystems/progress/test/perks.test.ts |
| `test/stats.test.ts` — additive + multiplicative; xp_gain_mul; empty perks list | ~100 | subsystems/progress/test/stats.test.ts |

**Deliverable.** All three systems unit-tested in isolation. No plugin wiring yet; tests use `progress-scenario.ts` fixtures.

**LOC total.** ~580.

**Verification commit.** `feat(progress): xp + perks + stats systems`.

### Phase 5.3 — Enemies (chasers) + spawn + 1-tile melee (sequential) — **shipped `9b6759c`**

Heavy duplication from bestiary. Annotate every copied file.

| Task | LOC | Files |
|---|---|---|
| `src/astar.ts` — COPY bestiary/src/astar.ts verbatim. Annotate `// FORGE-PROMOTION-CANDIDATE: 3rd consumer (bestiary, progress, boss). Promote at Phase 8 main.` | ~120 | subsystems/progress/src/astar.ts |
| `src/systems/ai-chaser.ts` — COPY bestiary/src/systems/ai/chaser.ts. Add `if (paused) return;` gate. Annotate. | ~60 | subsystems/progress/src/systems/ai-chaser.ts |
| `src/systems/path-step.ts` — COPY bestiary/src/systems/ai/path-step.ts. Add paused gate. Annotate. | ~60 | subsystems/progress/src/systems/path-step.ts |
| `src/systems/creature-occupancy.ts` — COPY bestiary/src/systems/creature-occupancy.ts. Annotate. | ~50 | subsystems/progress/src/systems/creature-occupancy.ts |
| `src/systems/enemy-spawn.ts` — 1 chaser / 60 ticks, cap 4, seeded spawn-cell from pool | ~80 | subsystems/progress/src/systems/enemy-spawn.ts |
| `src/systems/melee-swing.ts` — Z press: kill adjacent chaser in `dir_c` direction; emit xp_gain | ~80 | subsystems/progress/src/systems/melee-swing.ts |
| `src/systems/movement.ts` — cell-step (mirrors loot/movement.ts; adds paused gate) | ~50 | subsystems/progress/src/systems/movement.ts |
| `src/systems/tween.ts` — copy loot/tween.ts (visual_pos lerp; NOT gated on paused) | ~40 | subsystems/progress/src/systems/tween.ts |
| `src/systems/input.ts` — reads movement + Z swing + 1/2/3 pick_perk + R restart | ~60 | subsystems/progress/src/systems/input.ts |
| `src/systems/restart.ts` — R: world.clear + arena-gen + reset progress_r + clear disk save | ~50 | subsystems/progress/src/systems/restart.ts |
| `src/arena-gen.ts` — startup: spawn player + background rect + init perk_registry_r | ~100 | subsystems/progress/src/arena-gen.ts |
| `src/plugin.ts` — wire startup → pre → update → post stage order | ~100 | subsystems/progress/src/plugin.ts |
| `test/ai-chaser.test.ts` — A* path step; pursuit gate; aggro radius | ~80 | subsystems/progress/test/ai-chaser.test.ts |

**Deliverable.** Headless: spawn world, advance 300 ticks, assert N kills + XP level up. No UI yet.

**LOC total.** ~930. (Above arena's average — heavy duplication is the reason. Annotated for future deletion.)

**Verification commit.** `feat(progress): chasers + melee + spawn + plugin wiring`.

### Phase 5.4 — Perk-choice UI overlay + XP/level HUD (sequential) — **shipped `d37a97d`**

UI is fiddly; `coder` (not `coder-fast`).

| Task | LOC | Files |
|---|---|---|
| `src/systems/perk-choice-ui.ts` — Pixi Container on app.stage (sibling of surface_sprite, below palette_overlay per loot Q4); 3 perk buttons; click + 1/2/3 keyboard via synthetic action; viewport mirror on resize | ~150 | subsystems/progress/src/systems/perk-choice-ui.ts |
| `src/systems/hud.ts` — top-right XP bar (Graphics) + level Text + applied perks list (Text); on app.render.debug_overlay | ~80 | subsystems/progress/src/systems/hud.ts |
| `src/systems/synthetic-perk-pick.ts` — replay-bridge: reads pick_perk_0..2 actions → calls `perks_sys.queue_perk_pick(idx)` | ~40 | subsystems/progress/src/systems/synthetic-perk-pick.ts |
| `src/main.ts` — boot wiring: install perk_choice_container on app.stage at index before palette_overlay; wire pointerdown to perks_sys.queue_perk_pick; resize callback | ~120 | subsystems/progress/src/main.ts |
| `test/perk-choice-ui.test.ts` — pure hit-test math: given (x, y) design coords, returns perk idx 0..2 or null | ~80 | subsystems/progress/test/perk-choice-ui.test.ts |

**Deliverable.** Browser: kill enemies, see XP bar fill, level up → overlay appears, click/press 1-2-3 → perk applied, gameplay resumes.

**LOC total.** ~470.

**Verification commit.** `feat(progress): perk-choice UI + XP/level HUD`.

### Phase 5.5 — Disk save/load via localStorage (sequential) — NEW LOAD-BEARING CAPABILITY — **shipped `2583c53`**

Single `coder` (not `coder-fast`); disk persistence is the load-bearing new capability.

| Task | LOC | Files |
|---|---|---|
| `src/disk-save.ts` — `disk_save(s: Snapshot): Result<void, DiskError>` and `disk_load(): Result<Snapshot, DiskError>` per §2 Q12 | ~40 | subsystems/progress/src/disk-save.ts |
| `src/snapshot.ts` — `make_progress_snapshotter()` factory per §2 Q10 (mirrors loot/src/snapshot.ts) | ~50 | subsystems/progress/src/snapshot.ts |
| `src/palette-cmds.ts` — register `/save`, `/load`, `/perk-list`, `/grant-xp <N>`, `/kill-all` palette commands | ~60 | subsystems/progress/src/palette-cmds.ts |
| `src/systems/auto-save.ts` — post-stage system: on kill OR level-up tick, fire `disk_save(snapper.take(w, opts).value)` | ~60 | subsystems/progress/src/systems/auto-save.ts |
| `src/main.ts` — extend: on boot, call `disk_load()`; if `ok`, run boot tick + `snapper.restore` (per loot/test/replay.test.ts:make_restore_target pattern); if `no_save`, fresh run | ~40 (additive) | subsystems/progress/src/main.ts |
| `test/disk-save.test.ts` — localStorage round-trip; missing-save; schema-mismatch (synthetic future-version blob); fresh-run-when-no-save | ~150 | subsystems/progress/test/disk-save.test.ts |

**Deliverable.** Browser: play to level 2, reload page, see resumed state (XP bar position, applied perks list, alive chasers). Manual `/save slot-1` writes; `/load slot-1` restores.

**Test approach.** `test/disk-save.test.ts` uses `globalThis.localStorage = { /* fake */ }` shim before each test (per testing-strategy.md "in-memory representations"). Loot's pattern for snapshot tests reusable, plus the new shim.

**LOC total.** ~400.

**Verification commit.** `feat(progress): disk save/load via localStorage + palette commands`.

### Phase 5.6 — Snapshot round-trip + replay-as-test + disk-restore-as-test (sequential) — **shipped `8944f0e`**

Coder (not coder-fast); two load-bearing tests.

| Task | LOC | Files |
|---|---|---|
| `tools/record-level-and-save.ts` — scripted: spawn chasers → kill 4 → level up → pick perk_0 → repeat → snapshot mid-replay → restore → continue. Same shape as loot. | ~150 | subsystems/progress/tools/record-level-and-save.ts |
| `replays/level-and-save.replay.json` — generated by tool | (data) | subsystems/progress/replays/level-and-save.replay.json |
| `test/snapshot.test.ts` — focused unit tests: take → restore round-trip on level-up state; canonical-stringify world hash (COPIED from loot/test/replay.test.ts canonical_stringify helper) | ~180 | subsystems/progress/test/snapshot.test.ts |
| `test/replay.test.ts` — full replay-as-test with mid-replay snap → restore → continue (mirrors loot/test/replay.test.ts exactly) PLUS a separate test that does `snap = take(...); raw = JSON.stringify(snap); fresh = snapshot_schema.safeParse(JSON.parse(raw)).data; restore(w2, fresh, ...); world_hash(w) === world_hash(w2)` — the disk-format round-trip | ~250 | subsystems/progress/test/replay.test.ts |

**Replay assertions:**
- `xp_c.level === 3` after final action.
- `perks_c.applied === [perk_0, perk_1, perk_2]` (specific picks from the recorder).
- `stats_c.atk === expected_post_perks_value`.
- Mid-replay world-hash matches post-restore world-hash.
- End-of-replay world-hash matches expected (byte-stable across two consecutive recordings).
- **NEW:** disk-format round-trip world-hash matches in-memory round-trip world-hash (proves JSON.parse(JSON.stringify(s)) preserves shape).

**Critical pattern to copy:** loot's `make_restore_target` helper (per loot/FRICTION.md §2 / PROPOSED-AGENTS-UPDATES.md §2). Restore target MUST run its boot tick before `restore` or `arena_gen_system` clobbers the restored entities.

**Deliverable.** `bun --filter progress test test/replay.test.ts` green. Snapshot mid-replay is byte-stable. **Disk-format round-trip is byte-stable** — the new load-bearing assertion.

**LOC total.** ~580.

**Verification commit.** `test(progress): replay-as-test + snapshot + disk-restore round-trip`.

### Phase 5.7 — Debug fixture (sequential) — **shipped `48574fe`**

| Task | LOC | Files |
|---|---|---|
| `src/main-debug.ts` — debug fixture boot (mirrors loot/main-debug.ts shape) | ~80 | subsystems/progress/src/main-debug.ts |
| `src/debug-plugin.ts` — stripped plugin: 5 deterministic chaser spawns at fixed cells; auto-swing every 30 ticks; auto-pick perk_0 on every level-up trigger; auto-save then auto-reload mid-fixture; finish at level 3 | ~100 | subsystems/progress/src/debug-plugin.ts |
| Build script in `package.json` (mirror arena's): `bun build src/main-debug.ts --outdir dist/debug && mv dist/debug/main-debug.js dist/debug/main.js && cp debug.html dist/debug/index.html` | ~5 | subsystems/progress/package.json |
| **Critical (per arena FRICTION.md §9 + arena PROPOSED-AGENTS-UPDATES.md §6):** `debug.html` script tag references `./main.js`, NOT `./main-debug.js` | (data) | subsystems/progress/debug.html |
| `test/debug-fixture.test.ts` — optional headless sanity (replays the debug auto-script for ~500 ticks; asserts final level 3 + perks_c.applied.length === 3) | ~60 | subsystems/progress/test/debug-fixture.test.ts (skip if Phase 5.6's replay covers it) |

**Deliverable.** `/echo/progress/debug/` deploys. Page auto-runs: spawns → auto-kills → auto-levels → auto-picks → auto-saves → auto-reloads → restored state visible. Visual smoke verifies the disk round-trip with no manual input.

**LOC total.** ~245.

**Verification commit.** `feat(progress): debug fixture for level-up + disk save verification`.

### Phase 5.8 — Polish + FRICTION.md + PLAN.md promotion + AGENTS.md proposals (sequential) — **shipped this commit**

| Task | LOC | Files |
|---|---|---|
| `FRICTION.md` — friction discovered during progress dev | ~80 | subsystems/progress/FRICTION.md |
| `PLAN.md` — promote this `.plans/progress.md` into `subsystems/progress/PLAN.md` with status updated to "shipped" + Deviations section | ~varies | subsystems/progress/PLAN.md |
| `PROPOSED-AGENTS-UPDATES.md` — new conventions surfaced (see §11) | ~80 | subsystems/progress/PROPOSED-AGENTS-UPDATES.md |
| Update root `README.md` to list progress | ~5 | README.md |
| Final typecheck + lint + test sweep across the whole repo | 0 | (verification) |

**Verification commit.** `docs(progress): friction log + plan promotion + agents proposals`.

### Phase totals

| Phase | Echo LOC | Forge LOC | Parallel? | Status |
|---|---|---|---|---|
| 5.0 scaffold | ~365 | — | sequential | pending |
| 5.1 perks registry + XP curve + schemas | ~310 | — | sequential | pending |
| 5.2 xp + perks + stats systems | ~580 | — | sequential | pending |
| 5.3 chasers + melee + spawn | ~930 | — | sequential | pending |
| 5.4 perk-choice UI + HUD | ~470 | — | sequential | pending |
| 5.5 disk save/load via localStorage | ~400 | — | sequential | pending |
| 5.6 replay + snapshot + disk-restore tests | ~580 | — | sequential | pending |
| 5.7 debug fixture | ~245 | — | sequential | pending |
| 5.8 polish + docs | ~165 | — | sequential | pending |
| **Total** | **~4045** | **0** | | |

PLAN.md §7 Phase 5 budgeted **~810 echo-side LOC**. This plan estimates **~4045 echo-side. ~5× overshoot** — higher than loot (3.17×) and arena (2.6×).

**Why even higher than loot:**
- ~180 LOC of duplicated bestiary chaser AI + A* (the third copy; signal for Phase 8 promotion).
- ~400 LOC disk save infrastructure (new load-bearing capability).
- ~250 LOC of new tests for the disk round-trip (no precedent in loot or arena).
- Five separate testable systems (xp/perks/stats/spawn/melee) vs PLAN.md's collapsed "XP+levelling 100, perks 150, save/load 100" rows.
- Tests + debug fixture totals ~1100 LOC. PLAN.md §7 Phase 5 included "replay test 90" — short by 12× when tests are realistic.

**Recommendation: accept the overshoot.** Same as loot/arena. Re-baseline PLAN.md §7 Phase 5 row post-ship; surface as AGENTS.md proposal in §11. **Loot's PROPOSED §9 already calls out the planning multiplier; progress reinforces.**

---

## 6. Replay determinism + disk persistence strategy

### What `level-and-save.replay.json` records

Same shape as loot/arena/bestiary replays. `ReplayDoc` with:
- `seed: 1`
- `fixed_dt: 1 / 60`
- `frames: [...]` — tick-keyed action events (movement axes, Z swing, 1/2/3 pick_perk, R restart)

**Synthetic perk-pick actions** are recorded as regular digital actions (`pick_perk_0` / `pick_perk_1` / `pick_perk_2`) bound to keys `1`/`2`/`3`. Real users press the keys; replay-player consumes the actions. The DOM `pointerdown` on perk buttons also calls `queue_perk_pick(idx)` via the same factory pattern (per loot PROPOSED-AGENTS-UPDATES.md §4 / FRICTION.md §4). **No replay-schema extension needed.**

### Replay test assertions

```ts
describe("progress replay deliverable", () => {
  test("replay loads + validates schema", () => { /* schema check */ });

  test("after 4 kills, xp_c.level === 2", () => { /* */ });
  test("after first level-up, progress_r.paused === true", () => { /* */ });
  test("after pick_perk_0 action, progress_r.paused === false and perks_c.applied.length === 1", () => { /* */ });

  test("snapshot round-trip mid-replay preserves world hash", () => { /* canonical_stringify */ });
  test("continue from restored state, end state matches non-restored continuation", () => { /* parallel sims */ });

  test("DISK-format round-trip: JSON.parse(JSON.stringify(snap)) -> restore -> same world hash", () => {
    // snap = snapper.take(w, opts)
    // raw = JSON.stringify(snap)
    // parsed = JSON.parse(raw)
    // validated = snapshot_schema.safeParse(parsed); assert validated.success
    // restore(w2, validated.data, opts)
    // assert world_hash(w) === world_hash(w2)
  });

  test("xp_c.level === 3 + perks_c.applied.length === 3 at end of replay", () => { /* */ });
  test("stats_c.atk matches expected base + perk modifiers", () => { /* */ });
  test("two consecutive replay runs produce byte-identical world hashes", () => { /* */ });
});
```

### World hash for progress

```ts
const world_hash = (sim) => canonical_stringify({
  player_pos: cell_of(player_c),
  player_visual_pos: visual_pos_of(player_c),
  player_dir: dir_of(player_c),
  player_hp: hp_of(player_c),
  chasers: sorted_by_id(chasers_of(chaser_c)),     // [{ id, pos, hp, state, path_index }]
  xp: xp_of(player_c),                             // { current, level }
  perks: perks_of(player_c).applied,               // PerkId[]
  stats: stats_of(player_c),                       // { atk, def, spd, hp }
  progress_r: progress_r.value,                    // { paused, last_save_tick }
  pending_choices: level_up_pending_r.choices,     // PerkId[]
  tick: sim.ctx.time.tick,
});
```

Use `canonical_stringify` (copied from loot/test/replay.test.ts). Per loot FRICTION.md §1: Zod's `safeParse` normalises object key order to schema declaration order, so post-restore key order differs from pre-restore. Sort keys at every depth before stringify.

### Disk-format round-trip — the NEW load-bearing assertion

Beyond loot's in-memory snap+restore, progress tests the disk transport explicitly:

```ts
test("disk round-trip preserves world hash", async () => {
  const sim = make_sim(replay_doc);
  advance_to(sim, 100);

  // 1. Take in-memory snapshot
  const snap = make_progress_snapshotter().take(sim.w, opts);
  assert(snap.ok);

  // 2. Serialize + deserialize via localStorage shim
  const raw = JSON.stringify(snap.value);
  localStorage_shim.setItem(KEY, raw);
  const back_raw = localStorage_shim.getItem(KEY)!;
  const parsed = JSON.parse(back_raw);

  // 3. Validate against schema (catches version mismatch + missing fields)
  const validated = snapshot_schema.safeParse(parsed);
  assert(validated.success);

  // 4. Restore into fresh world
  const fresh = make_restore_target(replay_doc);
  const restored = make_progress_snapshotter().restore(fresh.w, validated.data, fresh.opts);
  assert(restored.ok);

  // 5. World hashes match
  assert(world_hash(sim) === world_hash(fresh));
});
```

**Why this matters:** the in-memory `snapper.take(w) → snapper.restore(w2, snap)` round-trip preserves JS objects byte-stably. The disk round-trip adds a `JSON.stringify → JSON.parse → safeParse` step. JSON drops `undefined`, normalises numbers, doesn't preserve object key order. **safeParse re-normalises key order per schema. The combination is byte-stable in shape, but the canonical_stringify projection is required for world-hash equality.** Test proves we got it right.

### Determinism risks specific to progress

1. **Map iteration order in `perk_registry_r`.** Same risk as loot's `item_registry_r`. **Mitigation:** registry iteration in game systems must be sorted-by-id (arena-gen + perk-choice-ui both touch). Tested in `perks.test.ts`.

2. **Random perk selection at level-up.** RNG fork: `ctx.rng.fork("perk-choice")` (or similar) ensures perk-choice draws don't deplete the global RNG state. Two replay runs draw the same 3 perks every time. **Mitigation:** test `xp.test.ts` asserts two consecutive level-ups with same seed produce identical choice arrays.

3. **Disk save timing.** `disk_save()` is called in `post` stage. If the snapshot includes a derived resource that's computed in `update` stage but cleared in next-tick's `pre`, the save might capture a "dirty" intermediate state. **Mitigation:** all derived state is recomputable from snapshotted state, OR is excluded from the snapshot (per §2 Q10).

4. **Spawn-cell selection stability.** `enemy-spawn.ts` picks a cell from a sorted pool via `ctx.rng.int(0, pool.length - 1)`. Deterministic. **Mitigation:** asserted in `ai-chaser.test.ts` (or `enemy-spawn.test.ts` if we split).

5. **Pause-state save mid-level-up.** If `auto-save` fires while `progress_r.paused === true` and `level_up_pending_r.choices` is populated, the saved snapshot includes the pending choices. On restore, the player is mid-pick — overlay should reappear and accept the choice. **Mitigation:** asserted in `disk-save.test.ts`.

### Snapshot-specific failure modes (mirrors loot)

- Component not registered. Same risk. Same defensive test (enumerate all components on a fully-populated world, assert each is either snapshotted or explicitly listed in a "runtime-only" allowlist).
- Resource not registered. Same.
- Zod schema drift. Same. Mitigation: derive component TS types from Zod schemas via `z.infer<...>` (per loot PROPOSED-AGENTS-UPDATES.md §1's spirit + risk R1).

### Disk-save failure modes (NEW)

- **localStorage quota exceeded.** Browser raises `QuotaExceededError`. `disk_save()` catches and returns `{ kind: "browser_storage_unavailable" }`. Main loop logs and continues (no crash). Documented in FRICTION.md if it bites at runtime.
- **localStorage disabled (Safari private mode, etc.).** `typeof localStorage === "undefined"` OR `localStorage.setItem` throws. Same fallback path.
- **Corrupted save (manual edit, partial write).** `JSON.parse` throws → `disk_load()` returns `{ kind: "parse" }`. Main treats as no-save → fresh run. No crash.
- **Schema mismatch (future-version save in old build).** `safeParse` fails → `disk_load()` returns `{ kind: "schema_validation" }`. Same fresh-run path.
- **Schema mismatch (old-version save in new build).** Same. We do NOT migrate; we discard. Recommend version-naive key migration UX post-Phase 5.

---

## 7. Migration / dependencies

### Echo workspace prerequisites (already in place)

- Root `package.json` lists `subsystems/*` in workspaces.
- Per-subsystem `package.json` shape established by bestiary + arena + loot.
- `.github/workflows/pages.yml` aggregates `subsystems/<name>/dist`.

### New deps for progress

- `@f0rbit/forge@^0.4.3` (matches loot's pin; no bump).
- `@f0rbit/corpus@^0.3.5` (matches loot).
- `pixi.js@^8` (matches loot).
- `zod@^3.25.0` (matches loot — needed for schemas, snapshot validation).

### Subsystem version drift

Per PLAN.md §5. After progress ships:
- `dungeon-walk`: `@f0rbit/forge@^0.4.2`.
- `bestiary`: `@f0rbit/forge@^0.4.2`.
- `arena`: `@f0rbit/forge@0.4.3`.
- `loot`: `@f0rbit/forge@^0.4.3`.
- `progress`: `@f0rbit/forge@^0.4.3`.

Phase 8 absorbs the alignment.

### BREAKING changes

**None.** No forge changes. Per loot's pattern.

### Loot's un-merged AGENTS.md proposals — which matter for progress

From `subsystems/loot/PROPOSED-AGENTS-UPDATES.md` (9 items):

| # | Item | Matters for progress? | Why |
|---|---|---|---|
| 1 | Snapshot world-hash canonical-stringify | **YES — critical.** | progress copies the projection helper. |
| 2 | `Snapshotter.restore()` destructively clears | **YES — critical.** | progress's `make_restore_target` mirrors loot's exactly. |
| 3 | Static config NOT in snapshot, rehydrate via startup | **YES — critical.** | `perk_registry_r` mirrors `item_registry_r`. |
| 4 | Transient state in factory closures, not resources | **YES — critical.** | `queue_perk_pick` mirrors `queue_click`. |
| 5 | Game-side UI overlays on `app.stage` mirror surface_sprite | **YES — critical.** | perk-choice modal uses the same pattern. |
| 6 | Sibling z-order via `addChildAt(idx)` | **YES — critical.** | Modal must be below palette_overlay. |
| 7 | Synthetic action bindings for replay-recordable UI | **YES — critical.** | `pick_perk_0..2` actions mirror `slot_click_0..11`. |
| 8 | `harness.tick()` only runs `update` stage | **YES — critical.** | progress tests pre-seed registry per loot pattern. |
| 9 | PLAN.md LOC budget multiplier | YES. | progress reinforces with 5× overshoot. |

**Recommendation: merge all 9 of loot's proposed conventions into AGENTS.md BEFORE Phase 5 starts.** They are all load-bearing for progress. If they're not merged, every coder agent will trip on the same friction during progress dev.

### Arena's remaining un-merged AGENTS.md proposals — which matter for progress

From `subsystems/arena/PROPOSED-AGENTS-UPDATES.md` (4 remaining items §1, §2, §4, §5):

| # | Item | Matters for progress? | Why |
|---|---|---|---|
| §1 | Hitstop = game-state gate (NOT `time.scale = 0`) | **YES — strong.** | The pause-mechanism in progress is the SECOND USE of this exact pattern. progress reinforces; merging both arena §1 and a new progress proposal as "Game-state gate" generalisation makes sense. |
| §2 | Hit-event consumers must not gate on hitstop | NO. | progress has no hit events (single-tick kill, no decoupled emit/consume). |
| §4 | Camera shake via `app.render.set_screen_offset` | NO. | progress has no camera shake. |
| §5 | Lighting filter for cosmetic-only use | NO. | progress has no lighting filter (matches loot's Q8 decision). |

**Recommendation: merge arena §1 before Phase 5.4** (perk-choice UI) — that's the phase that needs the pause gate. The other three are arena-specific and don't bind here.

---

## 8. Open questions (resolved with rationale)

### OQ-P1. Single slot vs multi-slot save?

**Resolved:** single named slot `"slot-1"` in v1. Palette accepts `/save <slot>` and `/load <slot>` with any name, but UI exposes only slot-1. Multi-slot UI is post-Phase 5. Validates the localStorage transport without bikeshedding slot management.

### OQ-P2. Should saves persist across echo version bumps?

**Resolved:** forwards-compatible by virtue of forge's `snapshot_schema.version: z.literal(1)`. A future `version: 2` build sees the old `version: 1` save in localStorage, `safeParse` fails, `disk_load` returns `{ kind: "schema_validation" }`, main.ts treats as "no save" → fresh run. **Migration tooling is post-Phase 5.** Document in FRICTION.md.

### OQ-P3. Pause via `progress_r.paused` vs `time.scale = 0`?

**Resolved (§2 Q9):** game-state gate. Arena's hitstop friction §1 + arena PROPOSED §1 documents why `time.scale = 0` deadlocks. progress is the second consumer of this pattern. Strong AGENTS.md proposal.

### OQ-P4. Reuse loot's `compute_stats` or roll our own?

**Resolved (§2 Q3):** roll our own. AGENTS.md forbids `@echo/shared`. Both implementations follow the same additive/multiplicative rules; Phase 8 unifies them. Annotate progress's `stats.ts` with `// FORGE-PROMOTION-CANDIDATE: 2nd consumer (loot + progress). Promote at Phase 8.`

### OQ-P5. Reuse arena's combat-melee or bestiary's chaser?

**Resolved (§2 Q2):** copy bestiary's cell-step chaser AI (~180 LOC). Add a 30-LOC `melee-swing.ts` that kills the chaser in the player's facing cell. Skip arena's continuous-motion combat (wrong motion model) and arena's hit-feedback stack (over-engineered for "single-swing kill"). The third copy of cell-step chaser AI is a strong Phase 8 forge-promotion signal.

### OQ-P6. 8 perks or fewer?

**Resolved (§2 Q6):** ship 5 stat-modifier perks. Cut `multi_shot` (needs projectiles), `regen` (needs hp-regen system), `double_swing` (needs cooldown system). All three would expand the combat surface area beyond the demo's purpose. Phase 8 can re-add them.

### OQ-P7. Disk save format — corpus Store or direct localStorage?

**Resolved (§2 Q12):** direct localStorage with `snapshot_schema.safeParse`. ~30 LOC vs ~150 for a full Store impl. Right shape for single-slot. forge-promote the localStorage backend at Phase 7 `hub` when the second consumer confirms.

### OQ-P8. Auto-save trigger?

**Resolved (§2 Q8):** on every kill + every level-up + manual via palette. No interval-based auto-save (forge determinism contract forbids `setInterval` outside `src/pixi/`). All saves are tick-aligned. Expected frequency: ~15 writes/minute; localStorage handles this trivially.

### OQ-P9. Are saves byte-stable across snapshot/load cycles?

**Resolved (§6):** yes — `world_hash` after `JSON.parse(JSON.stringify(snap))` round-trip equals the in-memory `snapper.take`/`snapper.restore` world hash, provided the canonical-stringify projection is used (per loot FRICTION.md §1). The NEW load-bearing test in Phase 5.6 verifies this explicitly.

### OQ-P10. PLAN.md §7 Phase 5 LOC overshoot (~5×)

**Resolved (§5):** accept; document cause. Same pattern as arena (2.6×) + loot (3.17×). progress is even larger because of the bestiary AI duplication + disk save infrastructure + disk round-trip tests. **Recommendation: update PLAN.md §7 Phase 5 row to reflect realistic budget post-ship.** AGENTS.md proposal in §11 (stacks on loot's §9).

### OQ-P11. Should the perk-choice modal block all input or only gameplay input?

**Resolved (§2 Q9):** blocks gameplay input via `progress_r.paused` gate. Pick-perk input system (`synthetic-perk-pick.ts` + DOM click handler) does NOT gate on paused — it's the only thing that can clear paused. Palette commands also bypass the gate. R-key restart cancels pause and resets state.

---

## 9. Risks

### R1 — Disk save corruption / quota exceeded silently bricks the run

A pathological browser state (full quota, private mode, third-party-cookie blocks) silently fails save → reload → fresh run with lost progress.

**Mitigation:**
- `disk_save` returns `{ kind: "browser_storage_unavailable" }` cleanly; main.ts logs to console.
- HUD shows a small `[SAVE: OFF]` indicator when last save failed. (5 LOC; nice-to-have, may defer.)
- Document in FRICTION.md if it bites real users.

### R2 — Save versioning mismatch on echo upgrade

A future `version: 2` snapshot schema rejects v1 saves. User loses progress.

**Mitigation:**
- `safeParse` failure → fresh run. **NO data corruption** (the v1 save is still in localStorage, just unreadable).
- Migration tooling deferred to forge v0.6+ (or whenever needed). Surface as forge-side issue.

### R3 — Pause-mid-level-up + save → restore-mid-level-up

User crosses XP threshold, sees perk-choice overlay, closes tab. Save was taken (auto-save on level-up). On reload, restore must put the player back into the pause state with the same 3 perk choices.

**Mitigation:**
- `progress_r.paused` AND `level_up_pending_r.choices` are BOTH snapshotted. Restore re-enters pause; overlay re-renders from `level_up_pending_r.choices`.
- Asserted in `disk-save.test.ts`.

### R4 — Bestiary chaser AI duplication accidentally diverges

The copied `astar.ts` + `ai-chaser.ts` + `path-step.ts` + `creature-occupancy.ts` are ~290 LOC of duplicated code. A bestiary bug fix doesn't propagate; a progress-side tweak doesn't either.

**Mitigation:**
- Annotate every copied file with `// FORGE-PROMOTION-CANDIDATE: <module> — Nth consumer. See <bestiary path>`.
- Phase 8 alignment task explicitly diffs the copies and promotes if compatible.
- Mid-Phase 5 sweep: when `boss` (Phase 6) copies the same AI for adds, Phase 8 promotion becomes mandatory.

### R5 — World-hash flakiness from JSON key ordering

Pure repeat of loot's R-loot-1. Mitigated by `canonical_stringify` (copied from loot). FRICTION.md captures.

### R6 — `progress_r.paused` gate forgotten on a new system

A coder adds a new gameplay system in Phase 5.4 or 5.5 and forgets `if (paused) return;`. The system runs during pause and corrupts state.

**Mitigation:**
- ESLint custom rule is overkill. Instead: lint-via-`grep` in CI: every file in `src/systems/` that's NOT in an allowlist (`tween`, `entity-render`, `hud`, `perk-choice-ui`, `synthetic-perk-pick`, `auto-save`) must include the substring `progress_r.paused` or `if (paused) return`.
- Document as a code-review checklist item in FRICTION.md.

### R7 — `auto-save` on every kill stutters at high kill rate

Pathological: kill 60 chasers in a second = 60 localStorage writes/second. localStorage.setItem is synchronous and ~0.5–2ms; pathological rate would total ~30–120ms/s = visible jank.

**Mitigation:**
- Realistically progress kills ~1/sec. Never hits the path.
- If it bites: throttle to "at most one save per N ticks" by reading `progress_r.last_save_tick`.
- Documented in §2 Q8; FRICTION.md if it surfaces.

### R8 — Replay-as-test for level-up cascades wrong

If a perk grants `xp_gain_mul: +0.25` and the next kill crosses TWO level thresholds (because the XP gain was larger than expected), the overflow logic must carry correctly through multiple levels. Plan §2 Q4 says "subtract the threshold from xp_c.current; overflow carries." This is non-trivial to get right.

**Mitigation:**
- Dedicated `test/xp-level.test.ts` covers: zero overflow, exact-threshold, mid-level overflow, double-overflow (skip a level), triple-overflow.
- Replay assertion covers a double-overflow specifically (one of the recorded kills is set up to skip from level 1 to level 3).

### R9 — Forge-side `engine_store` doesn't include localStorage; promotion held until Phase 7

We're shipping a 30-LOC bypass. When `hub` (Phase 7) hits the same wall, decision: promote game-side helper to forge, or maintain two consumers. **Recommend promote at end of Phase 7** (forge v0.4.x patch). Phase 7 plan should explicitly evaluate the bypass-vs-promote choice.

### R10 — LOC overshoot becomes a forecasting failure mode

Three subsystems in a row (arena 2.6×, loot 3.17×, progress ~5×) overshooting PLAN.md §7 budgets. Phase 8 estimate (~1850 LOC) is almost certainly under-sized.

**Mitigation:** AGENTS.md proposal (stacks on loot §9): future PLAN.md §7 phase rows explicitly include tests + debug fixture + duplicated-from-prior-subsystem LOC as separate line items. Re-baseline using arena + loot + progress actuals.

---

## 10. Phase task summary (for devpad mirror)

devpad MCP tools were not available in the prior loot session; assume not available here either per the user instruction. The user mirrors these manually, or a future session with devpad access runs `devpad_tasks_upsert` against the structure below. Each row maps to one devpad task with `tag: "progress"`, `project: echo`.

| Phase | Sub-task | Owner agent | Depends on |
|---|---|---|---|
| 5.0 | scaffold (`package.json`, components, resources, bindings, fixtures) | coder | — |
| 5.1 | perks registry + XP curve + Zod schemas | coder | 5.0 |
| 5.2 | xp + perks + stats systems + unit tests | coder | 5.1 |
| 5.3 | chasers + melee + spawn + creature_occupancy + plugin wiring (heavy bestiary copy) | coder | 5.2 |
| 5.4 | perk-choice UI overlay + XP/level/perks HUD + synthetic-perk-pick bridge | coder | 5.3 |
| 5.5 | disk save/load via localStorage + palette /save //load + auto-save system | coder | 5.4 |
| 5.6 | replay-as-test + snapshot mid-replay + DISK-format round-trip test | coder | 5.5 |
| 5.7 | debug fixture entry + auto-script + build script wiring | coder | 5.6 |
| 5.8 | FRICTION.md + PLAN.md promotion + PROPOSED-AGENTS-UPDATES.md + README link | coder | 5.7 |

**Task counts:** 9 sequential single-coder tasks, 0 parallel `coder-fast` tasks (matches loot's deliberate choice per arena FRICTION.md §6). 0 separate verification-coder phases — single coder commits inline at each phase end.

---

## 11. Suggested AGENTS.md updates

Propose these for `~/dev/echo/AGENTS.md` after progress ships, pending user approval. **Never write to AGENTS.md without confirmation.** Several stack on top of loot's un-merged proposals AND arena's remaining un-merged proposals.

### Stacks-on-top-of loot's un-merged proposals (all 9 still pending)

Recommend the user merges all 9 of loot's proposed conventions BEFORE Phase 5 starts. They're all load-bearing here (per §7 table).

### Stacks-on-top-of arena's un-merged proposals

Arena PROPOSED §1 (hitstop = game-state gate, NOT `time.scale = 0`) — progress is the SECOND USE of this exact pattern. **Merge arena §1 before Phase 5.4.**

### New conventions surfaced by progress

1. **Game-state gates are a reusable pattern; document with both consumers.** Both arena's hitstop and progress's pause-on-level-up use a resource-bag boolean (`hitstop_r.remaining > 0` / `progress_r.paused === true`) that every gameplay system early-returns on. The pattern's specific application differs (hit-feedback vs perk-choice) but the shape is identical. Add to AGENTS.md "Rendering conventions" or "Forge API gotchas":
   > ### Game-state gates
   > Pause-like gameplay states (hitstop, level-up pause, dialogue pause, boss-cutscene pause) are modelled as a resource-bag flag (`<sub>_r.paused: boolean` or `_r.remaining: number > 0`). Every gameplay system early-returns when set; render-stage systems keep ticking; the release system (which clears the flag) does NOT gate on itself. Do NOT mutate `ctx.time.scale = 0` — it deadlocks the schedule (see arena FRICTION.md §1).

2. **Disk persistence pattern: snapshot + JSON + localStorage + safeParse.** Until forge ships `create_localstorage_backend()`, game-side subsystems that need browser-persistent state use a 30-LOC bypass: `disk_save(s: Snapshot)` does `localStorage.setItem(KEY, JSON.stringify(s))`; `disk_load()` does `safeParse(JSON.parse(localStorage.getItem(KEY)))`. Forge's `snapshot_schema.version: z.literal(1)` provides forwards-compatible version mismatch handling. The single try/catch wraps the foreign `localStorage` API. Document in AGENTS.md "Build / test / deploy" or a new "Persistence" subsection.

3. **Save-trigger frequency policy.** Auto-save on player-meaningful events (kill, level-up, equip), not on a wall-clock interval. forge's determinism contract forbids `setInterval` outside `src/pixi/`. Wall-clock saves require additional state (last-save real-time) that hurts replay determinism. Document as a brief AGENTS.md addition.

4. **Duplicated-from-bestiary chaser AI is the third consumer.** Annotate all three subsystems (bestiary, progress, boss-to-come) with cross-references. Promote `astar` + `ai_chaser_system` + `creature_occupancy_system` to forge in Phase 8. Document as a planning-policy note rather than a runtime convention.

5. **Snapshot factory is per-subsystem; `make_<sub>_snapshotter()` lives in `src/snapshot.ts`.** Loot's `make_loot_snapshotter` is the precedent (PROPOSED §1 from loot already captures); progress mirrors. Standardise the file location (`src/snapshot.ts` per subsystem).

6. **PLAN.md §7 LOC budgets understate by 2.5–5× because they don't size duplicated code, tests, or debug fixtures.** Re-baseline using arena + loot + progress actuals. Future phases should list "core code / duplicated-from-X / tests / debug fixture" as separate columns. Stacks on loot's §9.

---

## 12. Reference paths

| Topic | Path |
|---|---|
| Subsystem package shape (canonical, post-loot) | `~/dev/echo/subsystems/loot/package.json` |
| Subsystem plugin pattern | `~/dev/echo/subsystems/loot/src/plugin.ts` |
| Snapshot factory pattern | `~/dev/echo/subsystems/loot/src/snapshot.ts` |
| `make_restore_target` test helper (CRITICAL — boot tick before restore) | `~/dev/echo/subsystems/loot/test/replay.test.ts` + loot FRICTION.md §2 |
| `canonical_stringify` projection helper (CRITICAL — JSON key order) | `~/dev/echo/subsystems/loot/test/replay.test.ts` + loot FRICTION.md §1 |
| Factory-closure transient state pattern | `~/dev/echo/subsystems/loot/src/systems/inventory.ts` (`make_inventory_system`) + loot FRICTION.md §4 |
| Synthetic action bindings for replay-recordable UI | `~/dev/echo/subsystems/loot/src/bindings.ts` + `loot/src/systems/synthetic-slot-click.ts` + loot FRICTION.md §7 |
| `app.stage` UI overlay sibling install pattern | `~/dev/echo/subsystems/loot/src/main.ts:113-121` + loot FRICTION.md §5–6 |
| Cell-step movement + tween pattern | `~/dev/echo/subsystems/bestiary/src/systems/movement.ts` + `tween.ts` + `~/dev/echo/subsystems/loot/src/systems/movement.ts` |
| Chaser AI to copy (source of truth) | `~/dev/echo/subsystems/bestiary/src/systems/ai/chaser.ts` + `path-step.ts` + `creature-occupancy.ts` + `~/dev/echo/subsystems/bestiary/src/astar.ts` |
| Hitstop game-state gate (arena's pattern progress reuses for pause) | `~/dev/echo/subsystems/arena/src/systems/hitstop.ts` + arena FRICTION.md §1 + arena PROPOSED §1 |
| Replay-as-test pattern | `~/dev/echo/subsystems/loot/test/replay.test.ts` |
| Recording tool pattern | `~/dev/echo/subsystems/loot/tools/record-equip-and-stat.ts` |
| Debug fixture pattern | `~/dev/echo/subsystems/loot/src/main-debug.ts` + `debug-plugin.ts` |
| Forge snapshot API | `~/dev/forge/src/snapshot.ts` |
| Forge storage API + save/load helpers | `~/dev/forge/src/storage/{save,store,mem,file}.ts` |
| Forge snapshot tests (canonical usage) | `~/dev/forge/test/storage/{integration,snapshot}.test.ts` |
| `event_to_world` | `~/dev/forge/src/pixi/coords.ts` |
| `harness.tick()` only runs `update` stage (CRITICAL test seeding constraint) | loot FRICTION.md §11 |
| Rendering conventions (non-negotiable) | `~/dev/echo/AGENTS.md` ("Rendering conventions") |
| Forge API gotchas (non-negotiable) | `~/dev/echo/AGENTS.md` ("Forge API gotchas") |
| Bun-test replay timeout override | `~/dev/echo/AGENTS.md` ("Replay-as-test timeouts") |

---

## 13. Deviations from plan

Corrections made during implementation that diverge from the plan above. Recorded so the plan reads truthfully against what shipped.

### 13.1 `state_c` shape simplified — no `aggro_radius` field

Plan §2 Q10 listed `state_c { kind, aggro_radius }` (carried over from bestiary). Phase 5.3 shipped `state_c { kind }` only, with `AGGRO_RADIUS = 8` as a module-level constant in `ai-chaser.ts`. Every chaser in progress shares the same aggro radius; per-entity state is wasted bytes. See FRICTION.md §2.

### 13.2 `stats_c.xp_gain_mul` added mid-flight in Phase 5.2

Plan §3 listed `stats_c { atk, def, spd, hp }`. The `xp_gain_mul` perk modifier needs an `xp_gain_mul` field on `stats_c` to compose; Phase 5.0 scaffold missed it; Phase 5.2 added it when implementing `compute_stats`. See FRICTION.md §3.

### 13.3 Auto-save uses post-stage diff-check (Option C), not `mark_dirty` plumbing

Plan §5.5 implied threading a `mark_dirty_for_save` flag through `xp.ts`, `melee-swing.ts`, and `perks.ts`. Phase 5.5 shipped a simpler `auto-save.ts` that keeps closure-local `prev_chaser_count` + `prev_level`, fires a save on either change. Three system files untouched; one post-stage system file added. See FRICTION.md §15.

### 13.4 Disk-save mid-replay `snap_tick` selected to avoid RNG-fork drift

Plan §6 sketched a mid-replay snap at "tick 1450 or thereabouts." Phase 5.6 pinned `snap_tick = 1460` — AFTER the third perk-pick fork-draw and BEFORE the next spawn fork at tick 1500. Closure-held `ctx.rng.fork()` streams are not in the snapshot surface, so any tick chosen between fork events keeps source + restored sims in sync. See FRICTION.md §5 and PROPOSED-AGENTS-UPDATES.md §1.

### 13.5 Debug fixture bypasses real combat — direct XP grants

Plan §5.7 sketched auto-swing + auto-chase choreography. Phase 5.7 shipped `xp_sys.emit_xp_gain(100/200/300)` directly at ticks 30/80/130, each sized to fire exactly one level-up given `xp_threshold(level) = 100 * level`. Simpler than choreographing pathing + facing + swing timing — and the fixture's job is to verify the level-up + persistence loop, not combat. Combat is covered by `test/replay.test.ts`. See FRICTION.md §14.

### 13.6 `creature_occupancy_system` runs in `pre` stage (not `update` as plan §5.7 suggested)

Plan §5.7 said `update` stage. Production wires it in `pre` (Phase 5.3) so occupancy is fresh BEFORE `ai-chaser` queries it in `update`. Followed production — plan was a typo. See FRICTION.md §12.

### 13.7 LOC overshoot vs PLAN.md §7 budget

PLAN.md §7 Phase 5 budgeted ~810 echo-side LOC. Progress shipped at ~4045 — 5× overshoot, higher than loot (3.17×) and arena (2.6×). Drivers per §5 phase totals: 180 LOC bestiary duplication, 400 LOC disk-save infrastructure, 250 LOC disk round-trip tests, five separate testable systems vs. plan's collapsed rows, tests + debug fixture totals ~1100 LOC. Recommendation per loot PROPOSED §9: re-baseline PLAN.md §7 Phase 5 row using the empirical 3–5× multiplier going forward.

