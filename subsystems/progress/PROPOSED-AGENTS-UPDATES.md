# Proposed AGENTS.md updates — progress Phase 5.0–5.8

These are conventions that emerged while building `subsystems/progress/`. Each block is shaped to paste into `~/dev/echo/AGENTS.md` at the indicated section. Review one-by-one and either merge into AGENTS.md or discard — **nothing here has been written to AGENTS.md yet**.

Citations point to FRICTION.md (this subsystem) and the relevant commits in `a952109..48574fe` + this docs commit.

---

## 1. Closure-held `ctx.rng.fork()` streams are NOT in the snapshot

> **Merged into AGENTS.md (commit pending).**

---

## 2. Cell-step + melee subsystems use facing-persistent `dir_c`; cell-step + no-melee can write blindly

> **Merged into AGENTS.md (commit pending).**

---

## 3. Convention for duplicating bestiary's chaser AI

> **Merged into AGENTS.md (commit pending).**

---

## 4. Disk-save key shared between production and debug fixture is intentional

> **Merged into AGENTS.md (commit pending).**

---

## 5. Stat-modifier fields used by systems should appear in scaffold's `components.ts`

> **Merged into AGENTS.md (commit pending).**

---

## 6. `world.despawn` returns `Result<void, EngineError>`

> **Merged into AGENTS.md (commit pending).**

---

## 7. Forge promotion candidate: `localstorage_store()` for `@f0rbit/forge/storage`

> **Merged into AGENTS.md (commit pending).**

---

## 8. Forge promotion candidate: `compose_modifiers()` helper

> **Merged into AGENTS.md (commit pending).**

---

## 9. Forge promotion candidate: A* + chaser AI

> **Merged into AGENTS.md (commit pending).**

---

## Notes for reviewer

- Items 1, 2, 5, 6 are the strongest AGENTS.md candidates — they document failure modes that bit during dev and are not covered by any existing rule. Pair them with the loot/arena merges.
- Item 3 codifies the convention for the ongoing duplication; mostly stops drift between copies.
- Item 4 is subsystem-specific friction — could fold into the existing "Debug fixture pattern" section as a footnote rather than a new rule.
- Items 7, 8, 9 are PLAN.md / forge edits, not AGENTS.md. Surfacing here so the user sees the cumulative promotion case ahead of Phase 8.
