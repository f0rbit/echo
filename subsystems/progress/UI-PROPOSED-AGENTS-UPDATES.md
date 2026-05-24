# Proposed AGENTS.md updates — progress GUI overhaul (Phases 1–3)

These are conventions that emerged across the GUI overhaul pass (`.plans/progress-gui-overhaul.md` Phases 1–3) that introduced 9-sliced UI primitives backed by Kenney Fantasy UI Borders. Each block is shaped to paste into `~/dev/echo/AGENTS.md` at the indicated section. Review one-by-one and either merge into AGENTS.md or discard — **nothing here has been written to AGENTS.md yet**.

Citations point to commits `7000dc2` (Phase 1 — helpers + cookbook fixture) and `e983c26` (Phase 2 — perk-choice modal rewrite), plus the plan at `.plans/progress-gui-overhaul.md`.

---

## 1. 9-sliced game UI panels + buttons — `NineSliceSprite` + Kenney convention

**Target section:** "Rendering conventions".

> ### 9-sliced game UI panels + buttons — `NineSliceSprite` + Kenney pack
>
> Game UI (modals, panels, buttons) uses Pixi v8's `NineSliceSprite` against
> Kenney-style asset packs (CC0 9-slice PNGs). Convention:
>
> - **Raw PNGs, no atlas.** Until a subsystem has ≥12 distinct UI assets the
>   atlas-packing overhead isn't justified — `NineSliceSprite` accepts a
>   `Texture` directly. The dungeon + walls atlases stay the precedent for
>   ≥40-tile sheets; UI is a different scale.
> - **Slice insets as module-level constants** in the wrapper file
>   (`DEFAULT_PANEL_INSETS = { left: 8, top: 8, right: 8, bottom: 8 }` for
>   Kenney's 48×48 borders). Document the source filename in a header comment
>   — a future asset swap forces a fresh visual-inspection pass + its own
>   constants.
> - **Asset loading — Option B (pre-boot `Assets.load`).** Wire UI texture
>   URLs into a helper like `subsystems/<sub>/src/ui/assets.ts:load_ui_assets()`
>   and `await` it BEFORE forge's `boot()`. Lazy `Texture.from()` inside the
>   wrappers risks a blank first frame on slow connections — visible flicker
>   exactly when the modal pops. Pixi's `Assets` cache is process-global so
>   later `Texture.from(url)` lookups stay synchronous once loaded.
> - **Modal placement.** Per existing "Game UI overlays — `app.stage` sibling,
>   mirror `surface_sprite`" recipe. NineSlice modals go on `app.stage`, NOT
>   `app.render.world` (lighting filter would darken them in unseen areas).
> - **Folder hygiene.** Kenney's pack ships subfolders with spaces — rename
>   to kebab-case on disk so URLs are clean (`transparent-border/` not
>   `Transparent%20border/`) per the repo's kebab-case filename convention.
>
> Established by Phase 1 (commit `7000dc2`) + Phase 2 (commit `e983c26`) of
> `.plans/progress-gui-overhaul.md`. First consumer: progress's perk-choice
> modal. See `subsystems/progress/src/ui/{assets,panel,button}.ts` for the
> canonical shapes and `subsystems/progress/FRICTION.md` §17–§19 for the
> friction notes that informed each decision.

---

## 2. Reusable UI primitives — game-side until 3rd consumer

**Target section:** "Architecture patterns", below the "Transient state in factory closures" note.

> ### Reusable UI primitives — game-side until 3rd consumer
>
> UI primitives (panel, button, future modal/list/dialog) live under
> `subsystems/<sub>/src/ui/` until 3+ subsystems consume them — at which
> point they promote to `@f0rbit/forge/ui`. Same 3-consumer gate as the
> chaser-AI bundle (see "Convention for duplicating bestiary's chaser AI"
> above), applied to UI.
>
> Canonical shape (from `subsystems/progress/src/ui/`):
>
> - **`assets.ts`** — `UiTextureName` string-literal union, name → URL map,
>   `load_ui_assets(): Promise<Record<UiTextureName, Texture>>` helper that
>   resolves before forge's `boot()`.
> - **`panel.ts`** — `make_panel({ texture, width, height, insets? }): { container }`.
>   Returns `{ container }` (not the `NineSliceSprite` directly) so callers can
>   `addChild` text / siblings on top without slice math leaking into the
>   public API. Future-proofs adding methods without breaking the call site.
> - **`button.ts`** — `make_button({ idle_tex, hover_tex?, pressed_tex?, width,
>   height, label?, insets? }): { container, set_state, get_bounds }`.
>   `set_state("idle" | "hover" | "pressed")` swaps layered NineSlice
>   children OR modulates `idle.tint` when only `idle_tex` is supplied (Kenney
>   ships a single base, not per-state PNGs). `get_bounds()` returns
>   `{x, y, w, h}` so existing pure-function hit-test helpers stay load-bearing.
>
> Header convention: each file carries a `// FORGE-PROMOTION-CANDIDATE`
> header listing all known consumers + the planned promotion phase (currently
> Phase 8 `main`). Reuses the same comment shape as the chaser-AI bundle.
> Density of promotion-candidate headers across the repo is the signal future
> agents look for when scoping forge bumps.
>
> Established by commit `7000dc2` (Phase 1 of `.plans/progress-gui-overhaul.md`).
> Current count: 1/3 consumers (progress only). See "Forge promotion candidates
> (deferred)" table below for the active tracker row.

---

## 3. Forge promotion candidates table — add `forge.ui` row

**Target section:** "Forge promotion candidates (deferred)".

> Add a new row to the table:
>
> | Candidate | Current consumers | Imminent consumer | Recommended promotion phase | Target path |
> |-----------|-------------------|--------------------|-----------------------------|-------------|
> | `forge.ui` (panel + button `NineSliceSprite` wrappers) | progress (1) | boss likely #2, hub or main likely #3 | end of Phase 8 `main` | `forge/src/ui/` |
>
> **Promoted shape would generalise** `UiTextureName` from a fixed string
> literal union to a string-keyed `Record<string, Texture>` — the wrapper API
> shouldn't constrain consumer-specific asset names. `panel.ts` + `button.ts`
> already accept `Texture` (not URL strings) so the consumer controls loading;
> only `assets.ts`'s name-typing needs to relax at promotion time.
>
> See `subsystems/progress/src/ui/{panel,button}.ts` for the current shape and
> the "Reusable UI primitives — game-side until 3rd consumer" note above for
> the gate.

---

## 4. Debug fixture pattern — addendum: one fixture per visual concern

**Target section:** existing "Debug fixture pattern" section.

> ### Addendum — one debug fixture per visual concern
>
> When a subsystem ships multiple debug fixtures, each fixture validates
> exactly one concern. Don't conflate a UI cookbook with a gameplay-state
> fixture. Example: progress ships two —
>
> - `/echo/progress/debug/` (`src/main-debug.ts`) — validates the level-up
>   state machine + persistence via choreographed XP grants. Real save/restore
>   round-trip, real perk picks, no UI variation exercised.
> - `/echo/progress/debug-gui/` (`src/main-debug-gui.ts`) — validates the
>   visual primitives. Every panel + button state on one screen, no gameplay,
>   no input wiring beyond pointer-hover. Title text + idle/hover/pressed
>   buttons rendered as a static cookbook.
>
> Conflating them muddles each fixture's responsibility — a regression in one
> concern shouldn't require investigating the other.
>
> Each fixture gets its own boot, its own (optionally stripped) plugin, its
> own HTML shell, and its own build-script entry per the "Debug build pipeline
> rename" recipe. The deploy step's `cp -r dist/. _site/.../<sub>/` picks all
> fixtures up automatically — no `pages.yml` change needed when adding a new
> one.
>
> Established by Phase 1 of `.plans/progress-gui-overhaul.md` (commit
> `7000dc2`). See the plan §5 for the rationale.

---

## Future work — `.plans/progress-gui-overhaul.md` §9 + Phase 3 follow-ups

Captured for the next agent that picks up the GUI thread. None of these block Phase 3 close-out; all live as TODOs against the helpers shipped in Phases 1–2.

- **Pressed-state animation** — 100 ms ease on click before `opts.on_pick` fires. Trivial wiring in `attach_pointer`. Skipped in Phase 2 because the modal closes immediately on pick (pressed state would be invisible). Add when game-design lands a "feel" pass on the level-up modal.
- **Hover wiring in production** — `pointermove` → `set_state("hover")`. Game-design call (does it add value for a 3-button modal?). The factory exposes the shape; opt-in at the call site.
- **HUD restyling** — `src/systems/hud.ts` could adopt `Panel` for the top-right LV/XP/HP/stats card. Currently lives on `app.render.debug_overlay` (unfiltered, canvas-pixel space), so it needs a separate crisp-text + scale story before `NineSliceSprite` will render cleanly there. Defer to a HUD-specific pass.
- **`forge.ui` promotion** — when boss (consumer #2) ships and hub or main makes #3, gather the panel/button shape into `@f0rbit/forge/ui`. Per `PLAN.md` §5 + the promotion-candidates table addition above. Also move `UiTextures` from `perk-choice-ui.ts` to `assets.ts` as part of the promotion (see `subsystems/progress/FRICTION.md` §23).
- **Theming** — Kenney ships brown / blue / green / red variants. A `theme: "brown" | "blue" | ...` arg on `make_panel` / `make_button` falls out naturally once two consumers want different palettes. Until then, the consumer picks the asset URL directly via `assets.ts`'s name map.
- **Asset variants** — the Phase 1 cookbook chose `panel-border-000.png` (corner brackets). 31 other border variants ship in `public/ui-borders/border/` (solid-filled, rope-bordered, etc.). Future consumers can swap by changing the URL in `assets.ts`; the slice insets may need re-derivation per variant.
- **Local-smoke HTTP script** — add `"serve": "bun --port 4567 serve dist"` to each subsystem's `package.json` so the verification coder can self-smoke without orchestrator help. See `subsystems/progress/FRICTION.md` §22.

---

## Summary

4 candidate AGENTS.md additions captured (rendering convention, UI primitives architecture pattern, `forge.ui` promotion row, debug-fixture-per-concern addendum). None merged yet — review with the user and integrate one-by-one (each is shaped as a paste-ready block with a target section). Plus a future-work checklist that doesn't belong in AGENTS.md but is worth keeping co-located with the proposals while the GUI work is still warm.

Cross-references: `.plans/progress-gui-overhaul.md` §11–§12 for the original plan-time scope, `subsystems/progress/FRICTION.md` §17–§23 for the friction notes informing each proposal, and `subsystems/arena/POLISH-PROPOSED-AGENTS-UPDATES.md` for the precedent on staging conventions outside AGENTS.md for user review.
