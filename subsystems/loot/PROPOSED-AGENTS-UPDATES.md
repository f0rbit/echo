# Proposed AGENTS.md updates — loot Phase 4.0–4.7

These are conventions that emerged while building `subsystems/loot/`. Each block is shaped to paste into `~/dev/echo/AGENTS.md` at the indicated section. Review one-by-one and either merge into AGENTS.md or discard — **nothing here has been written to AGENTS.md yet**.

Citations point to FRICTION.md (this subsystem) and the relevant commits in `b235c96..5f6f63d` + this docs commit.

---

## 1. Snapshot world-hash projections need canonical-stringify

> **Merged into AGENTS.md (commit pending).**

---

## 2. `Snapshotter.restore()` destructively clears the world

> **Merged into AGENTS.md (commit pending).**

---

## 3. Static config NOT in snapshot — rehydrate via startup

> **Merged into AGENTS.md (commit pending).**

---

## 4. Transient state lives in factory closures, not resources

> **Merged into AGENTS.md (commit pending).**

---

## 5. Game-side UI overlays install on `app.stage` and mirror surface_sprite

> **Merged into AGENTS.md (commit pending).**

---

## 6. Sibling z-order in `app.stage` — use `addChildAt(idx)`, not `addChild`

> **Merged into AGENTS.md (commit pending).**

---

## 7. Synthetic action bindings as the replay-stable UI input channel

> **Merged into AGENTS.md (commit pending).**

---

## 8. Bun harness `harness.tick()` only runs the `update` stage

> **Merged into AGENTS.md (commit pending).**

---

## 9. PLAN.md §7 LOC budgets understate by ~3× — re-baseline using empirical multiplier

> **Merged into AGENTS.md (commit pending).**

---

## Notes for reviewer

- Items 1–4 are the biggest deliverables — they document non-obvious snapshot/restore failure modes that bit hard during Phases 4.5–4.6. Strongest case for inclusion.
- Items 5–6 are UI-overlay patterns the next UI-owning subsystem (`hub` dialogue, `progress` perk-choice) will hit unless documented. Effectively stack on top of arena's PROPOSED-AGENTS-UPDATES.md §4 ("Camera shake via `app.render.set_screen_offset`") as the second `app.stage`-touching convention.
- Item 7 is the most clever / least obvious — strong case for AGENTS.md merge because a future agent will absolutely try to "simplify" the synthetic-binding trick into "just record mouse coords directly" and break replay.
- Item 8 is generic bun-test ergonomics; arguably belongs in the root-level "Build / test / deploy" rather than echo-specific AGENTS.md.
- Item 9 is a PLAN.md edit, not an AGENTS.md addition. Surfaces a recurring planning miss.
