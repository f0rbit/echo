# progress — GUI overhaul (9-slice perk-choice modal)

> Status: planning. Scope: replace the level-up perk-choice modal's `Graphics.rect()` backdrop + buttons with a real 9-sliced GUI experience driven by Kenney Fantasy UI Borders. Per-game helpers in `subsystems/progress/src/ui/` anticipating Phase 8 promotion to `@f0rbit/forge/ui`.
>
> Citations point to `subsystems/progress/src/systems/perk-choice-ui.ts` (the target file) and `~/dev/echo/AGENTS.md` rendering conventions.

---

## 1. Summary

The current perk-choice modal (`subsystems/progress/src/systems/perk-choice-ui.ts:130-206`) renders a 60%-opaque black `Graphics.rect()` backdrop with three 80×40 `Graphics.rect()` buttons. It works; it does not look like an RPG menu.

This overhaul:

1. Introduces Kenney **Fantasy UI Borders** (CC0, 130+ 9-slice PNGs) under `subsystems/progress/public/ui-borders/`.
2. Adds **two reusable wrappers** in `subsystems/progress/src/ui/`:
   - `panel.ts` — `NineSliceSprite`-backed `Container`, configurable width / height / slice insets / texture.
   - `button.ts` — `NineSliceSprite`-backed `Container` with `set_state("idle"|"hover"|"pressed")` and `get_bounds()` so the existing pure-function `button_at` hit-test stays load-bearing.
3. **Rewrites** `perk-choice-ui.ts` internals to compose `Panel` + `Button[]` while keeping the public signature (`make_perk_choice_ui(opts)`) **and** the exported pure hit-test surface (`button_rects`, `button_at`) byte-stable so `test/perk-choice-ui.test.ts` keeps passing without amendment.
4. Adds a **GUI cookbook debug fixture** at `/echo/progress/debug-gui/` exercising every panel + button state in one screen for fast visual iteration.
5. Reserves a `subsystems/progress/UI-PROPOSED-AGENTS-UPDATES.md` doc (mirrors arena's `POLISH-PROPOSED-AGENTS-UPDATES.md` precedent — unmerged, user reviews) for the new conventions and the `forge.ui` promotion meter (now 1/3).

Per `subsystems/loot/PLAN.md` §373 + `PLAN.md` §4.4 / §5: this is consumer **#1** of "real GUI". The `forge.ui` subpath stays gated on consumer #3 (boss Phase 6 + hub Phase 7 → main Phase 8 is the third). All helpers live game-side until then.

**Replay determinism unchanged.** UI is render-side. `test/replay.test.ts:world_hash` projects gameplay state only; the projection doesn't touch any Pixi container, so the eight existing replay assertions stay green without re-recording. The snapshotter (`src/snapshot.ts:56-72`) registers components + resources only — `NineSliceSprite` instances aren't snapshotted, can't be snapshotted, and don't need to be.

**Out of scope** (explicit):

- Forge promotion to `@f0rbit/forge/ui`. Per `PLAN.md` §5 the gate trips at 3+ UI-owning subsystems. This plan ships consumer #1. Promotion is Phase 8 work.
- Loot inventory overhaul. Loot has a 12-slot grid (consumer-style mismatch); separate plan when consumer #2 lands.
- Arena menu / win / lost shell screens. Crisp-text recipe + game-shell FSM still settling (see `subsystems/arena/POLISH-PROPOSED-AGENTS-UPDATES.md` — unmerged). Revisit when consumer #3 lands and the panel/button shape is proven.
- Font change. The existing monospace + crisp-text recipe (commit `2f6e25c` / `subsystems/arena/POLISH-PROPOSED-AGENTS-UPDATES.md` §1) stays.
- HUD restyling (`src/systems/hud.ts` stays raw `Graphics` for now). The HUD lives on `app.render.debug_overlay` (unfiltered, canvas-pixel space); applying `NineSliceSprite` there would need a separate crisp-text + scale story. Defer.
- Hover state on perk buttons. Spec'd in `button.ts`'s `set_state` but `perk-choice-ui.ts` does NOT wire pointer-move — the cell-step + keyboard-1/2/3 path is the primary UX. Hover is opt-in for the debug fixture and any future consumer that wants it.

---

## 2. Affected files

| File | Action | Touched by |
|---|---|---|
| `subsystems/progress/public/ui-borders/*.png` | **NEW** — Kenney CC0 asset drop (user-supplied) | Phase 1 |
| `subsystems/progress/src/ui/panel.ts` | **NEW** — NineSliceSprite wrapper, ~80 LOC | Phase 1 |
| `subsystems/progress/src/ui/button.ts` | **NEW** — NineSliceSprite + state wrapper, ~120 LOC | Phase 1 |
| `subsystems/progress/src/main-debug-gui.ts` | **NEW** — GUI cookbook debug fixture, ~140 LOC | Phase 1 |
| `subsystems/progress/debug-gui.html` | **NEW** — debug fixture HTML shell, ~20 LOC | Phase 1 |
| `subsystems/progress/package.json` | EDIT — extend `build` to bundle `main-debug-gui.ts` and copy `debug-gui.html`; copy `ui-borders/` into `dist/`+`dist/debug/`+`dist/debug-gui/` | Phase 1 |
| `subsystems/progress/src/systems/perk-choice-ui.ts` | **REWRITE** (internals only) — swap `Graphics.rect` for `Panel` + `Button[]`; preserve exports (`button_rects`, `button_at`, `make_perk_choice_ui`, `PerkChoiceUI`, `PerkChoiceUIOpts`, `ButtonRect`); ~280 LOC after | Phase 2 |
| `subsystems/progress/src/main.ts` | EDIT — add `ui-borders/*` URLs to boot `assets` array (option B) OR rely on lazy `Texture.from()` in panel/button (option A — see §4); 0–5 LOC | Phase 2 |
| `subsystems/progress/src/main-debug.ts` | EDIT — same asset wiring as `main.ts` so the existing `/debug/` fixture keeps rendering | Phase 2 |
| `subsystems/progress/test/perk-choice-ui.test.ts` | UNCHANGED — guards the pure `button_rects` + `button_at` surface; rewrite must not break it | Verification (Phase 2) |
| `subsystems/progress/test/replay.test.ts` | UNCHANGED — UI is render-side; `world_hash` projection unaffected | Verification (Phase 2) |
| `subsystems/progress/FRICTION.md` | EDIT — append numbered slots §17–§21 for new gotchas (see §10 below) | Phase 3 |
| `subsystems/progress/UI-PROPOSED-AGENTS-UPDATES.md` | **NEW** — staging ground for AGENTS.md additions (mirrors arena's POLISH precedent) | Phase 3 |

Total NEW: 6 files. EDIT: 4. REWRITE: 1.

---

## 3. Integration point analysis

### 3.1 `perk-choice-ui.ts` public surface — DO NOT change

The file's exports drive:

- `subsystems/progress/test/perk-choice-ui.test.ts` — 9 tests against `button_rects` + `button_at` (lines 8-83 of the test file). They lock `BUTTON_COUNT = 3`, `BUTTON_W = 80`, `BUTTON_H = 40`, `BUTTON_GAP = 8`, the centred-row layout, and inclusive-edge hit semantics. **These constants stay.**
- `subsystems/progress/src/main.ts:165-170` — `make_perk_choice_ui({ on_pick, get_visible, get_choices, get_registry })`.
- `subsystems/progress/src/main-debug.ts:140-145` — same factory call.

What the file CAN change without breaking consumers:

- `Container` children (the `Graphics` backdrop + button layer become `Panel` + `Button[]` children).
- `redraw()` body — composes Panel + Button state per tick instead of clearing + filling Graphics.
- Internal text positioning math (still anchored relative to `button_rects[i]`, so unit tests stay green).

### 3.2 Pixi v8 `NineSliceSprite`

Constructor: `new NineSliceSprite({ texture, leftWidth, topHeight, rightWidth, bottomHeight, width, height })`. Setting `width` + `height` at construction time scales the centre region — that's the whole point. Source of truth: <https://pixijs.download/release/docs/scene.NineSliceSprite.html>.

**Three integration risks** to verify in Phase 1 (smoke test in the debug fixture):

1. **Filter + RenderTexture interaction.** Progress wraps `app.render.world` in the lighting filter (`src/main.ts:87`). The modal sits on `app.stage` as a sibling of `surface_sprite` (`src/main.ts:171-172`), so the filter does not apply to the modal. Confirm in the debug-GUI fixture by visual inspection. If `NineSliceSprite` interacts oddly with the offscreen `surface_sprite` composite, the smoke test catches it before the rewrite phase.
2. **Texture loading race.** `Assets.load([...])` in the boot `assets:` array (option B) blocks `boot()` until the texture is ready. `Texture.from(url)` inside `panel.ts` / `button.ts` (option A) is lazy and can render a blank frame on first tick before the texture resolves. **Recommend option B** — wire `ui-borders/*.png` into the existing boot `assets:` array as a new `{ kind: "image" }` (or whatever the forge `boot()` API supports for raw PNG; if forge's assets enum is atlas-only today, fall back to a one-shot `Assets.load(urls)` BEFORE `boot()`). Document choice in `panel.ts` header.
3. **Crisp-text recipe still applies.** Modal stays on `app.stage` mirroring `surface_sprite` — per `AGENTS.md` "Crisp text recipe" all `Text` constructors keep `resolution: 4` + `scale.set(0.5)`. `Panel` + `Button` host the Text children verbatim; no recipe change.

### 3.3 Replay determinism

`test/replay.test.ts:world_hash` (lines 131-153) projects: `player_pos`, `player_visual`, `player_xp`, `player_perks`, `player_stats`, `player_hp`, `chasers`, `progress`, `level_up_pending`, `tick`. **Nothing UI-shaped.** UI containers can spawn or de-spawn freely without affecting any hash. Confirm by running `bun test` after the rewrite — all 8 assertions stay byte-equal.

### 3.4 Snapshot determinism

`src/snapshot.ts:56-72` registers gameplay components + four resources. `NineSliceSprite` instances live on `app.stage`, not in `world` or `res`, so they're invisible to the snapshotter by design. `make_progress_snapshotter` requires zero changes.

### 3.5 Asset acquisition

User-supplied step (do this once before Phase 1 starts):

1. Visit <https://kenney-assets.itch.io/fantasy-ui-borders>. Pay $0 ("name your own price") + download the ZIP.
2. Extract `PNG/` directory contents into `subsystems/progress/public/ui-borders/`. Keep Kenney's filenames verbatim (e.g. `panel_brown.png`, `button_blue.png`) — no rename.
3. The pack ships at multiple scales (e.g. `1x/`, `2x/`); use the **2x** variants if available (better visual quality at the 4× DPI super-sample) — fall back to `1x/` if only one scale ships.

**Specific PNGs the rewrite consumes** (subject to what's in the pack — verify on extract; substitute close equivalents):

| Asset | Used for | Slice insets (px, on 2x art) |
|---|---|---|
| `panel_brown.png` (or similar warm-tone bordered panel) | Backdrop behind perk-choice title + buttons | 8 / 8 / 8 / 8 (or 12 / 12 / 12 / 12 if pack ships 2x with thicker borders) |
| `button_brown.png` (idle) | Default button state | 6 / 6 / 6 / 6 |
| `button_brown_pressed.png` (or darker variant) | Pressed state on click + replay-synth click | 6 / 6 / 6 / 6 |
| `button_brown_hover.png` (optional; or a `_light` variant tinted in code) | Hover state on debug fixture only | 6 / 6 / 6 / 6 |

If the pack doesn't ship distinct idle/hover/pressed PNGs: pick one base PNG and modulate via `sprite.tint` (e.g. `tint = 0xc0c0c0` for pressed) in `button.ts`. Document the fallback in the file header so the next agent doesn't re-investigate.

**Final slice insets stored in `panel.ts` / `button.ts` as module-level constants** — derived from visual inspection of the chosen PNG (Kenney's borders are typically 4–8 px on 1x, doubled on 2x). Justify in a header comment.

### 3.6 Atlas build vs raw PNGs

`tools/gen-walls-autotile-atlas.ts` is the precedent for the dungeon + walls atlases. It packs hand-aligned tiles into a forge atlas JSON. **For ui-borders the friction is not worth it** — we have ~4 PNGs (not 47 tiles), `NineSliceSprite` accepts a `Texture` directly, and the `Assets.load()` call cost for 4 small images is negligible. **Recommendation: raw PNGs**. Document in `panel.ts` header (decision rationale + path to revisit if the asset count grows past ~12).

---

## 4. Asset loading approach — DECISION

**Option A — lazy `Texture.from(url)` inside `panel.ts` / `button.ts`.** Simple. Risks a blank first frame.

**Option B — `Assets.load([...])` before `boot()`, OR wired into forge's `boot({ assets: [...] })` if forge accepts a `{ kind: "image" }` entry.** Blocks boot for ~20 ms (network + decode); guarantees readiness on first tick.

**Recommendation: Option B with a fallback path.** Phase 1 implementer should:

1. Check the forge `boot()` API (`@f0rbit/forge/pixi`) — `BootAssetSpec` likely supports `{ kind: "image", alias, url }` alongside `{ kind: "atlas", ... }`. If yes: extend `main.ts` + `main-debug.ts` + `main-debug-gui.ts`'s `assets:` array with one entry per ui-border PNG.
2. If forge `boot()` only accepts `atlas` today: drop one `await Assets.load([...urls])` call BEFORE the `await boot({...})` call in `main.ts` / `main-debug.ts` / `main-debug-gui.ts`. Pixi's `Assets` cache is process-global so `panel.ts` / `button.ts` can later do `Texture.from(url)` and get the already-loaded handle synchronously.

`panel.ts` + `button.ts` should accept a `Texture` (not a URL string) in their public API so the caller controls loading. Internal helper `load_ui_assets()` exported from `subsystems/progress/src/ui/assets.ts` can centralise the URL list + return a `Record<name, Texture>` after `Assets.load`. ~30 LOC.

This pushes the "is asset ready" concern to boot, which is exactly where it belongs.

---

## 5. Debug fixture — `/echo/progress/debug-gui/`

**New** standalone fixture (NOT folded into the existing `/debug/`). Rationale:

- The existing `/debug/` (`src/main-debug.ts`) bypasses real combat with direct XP grants to verify the **level-up + save loop** (per `FRICTION.md` §14 + §13). Conflating that with a static "UI cookbook" muddles the fixture's responsibility.
- A cookbook page renders **every state in one screen** for instant visual regression — separate boot, no plugin, no game systems, no input wiring beyond pointer-hover for button states.

**Layout** (320×180 design canvas — same as production):

```
+--------------------------------------+
|  panel_brown (centred, 200×120)      |
|  ┌────────────────────────────────┐  |
|  │  Panel sample — title text     │  |
|  │  [ idle ] [ hover ] [pressed]  │  |
|  │  small label                   │  |
|  └────────────────────────────────┘  |
+--------------------------------------+
```

**Build wiring** (mirror `arena` debug-fixture rename per `AGENTS.md` "Debug build pipeline rename"):

```
bun build src/main-debug-gui.ts --outdir dist/debug-gui --target browser
mv dist/debug-gui/main-debug-gui.js dist/debug-gui/main.js
cp debug-gui.html dist/debug-gui/index.html
cp -r public/* dist/debug-gui/
```

`debug-gui.html` references `./main.js` (post-rename), not `./main-debug-gui.js`. Per `AGENTS.md` "Debug build pipeline rename" + arena FRICTION.md §9 — same trap.

**Deploy URL:** `https://f0rbit.github.io/echo/progress/debug-gui/`. The Pages workflow's existing `cp -r "$sub/dist/." "_site/.../$name/"` line picks `dist/debug-gui/` up automatically; no `pages.yml` change needed.

**Visual smoke is the gate** for Phase 1 — a screenshot of the cookbook page is the "asset acquisition worked + NineSliceSprite renders right" sign-off before the rewrite phase starts.

---

## 6. Phasing

Sequential. Each phase ends with verification + atomic commit per `AGENTS.md` hard rules. Each phase has a coder + a verification coder.

### Phase 1 — Asset + helpers + cookbook fixture

**Goal.** Ship the reusable shape (`Panel` + `Button`) and a visual smoke fixture. **No production code changed yet.**

| Task | Core LOC | Tests LOC | Debug-fixture LOC | Realised w/ 2.5× | Touches |
|---|---|---|---|---|---|
| Pre-Phase: user drops `ui-borders/*.png` into `subsystems/progress/public/ui-borders/` (manual, one-time) | 0 | 0 | 0 | 0 | `public/ui-borders/` |
| 1.1 `src/ui/assets.ts` — URL list + `load_ui_assets()` helper; document Option B + fallback | 40 | 0 | 0 | ~100 | `src/ui/assets.ts` |
| 1.2 `src/ui/panel.ts` — `make_panel({ texture, width, height, insets })` returning `{ container }`; FORGE-PROMOTION-CANDIDATE header | 80 | 0 | 0 | ~200 | `src/ui/panel.ts` |
| 1.3 `src/ui/button.ts` — `make_button({ idle_tex, pressed_tex, hover_tex?, width, height, insets, label })` returning `{ container, set_state, get_bounds }`; FORGE-PROMOTION-CANDIDATE header | 120 | 0 | 0 | ~300 | `src/ui/button.ts` |
| 1.4 `src/main-debug-gui.ts` + `debug-gui.html` — cookbook fixture; renders 1 panel + 3 buttons (idle/hover/pressed) + title text; pointer-move switches the middle button between idle and hover for live testing | 140 | 0 | n/a (this is the fixture) | ~350 | `src/main-debug-gui.ts`, `debug-gui.html` |
| 1.5 `package.json` — extend `build` script for `main-debug-gui.ts` + `cp -r public/ui-borders/* dist/...` for all three deploy targets | 5 | 0 | 0 | ~12 | `package.json` |
| 1.6 Verification — `bun typecheck`, manual `bun run build && open dist/debug-gui/index.html`, screenshot the cookbook; commit | 0 | 0 | 0 | 0 | (verification) |

**Sub-phase budget.** Core 245 + fixture 140 = 385 LOC source. Realised at the AGENTS.md 2.5–3× multiplier: **~960–1150 LOC** including comments, typing, header annotations.

**Parallelisation.** 1.1 → 1.2 ∥ 1.3 (independent files, no shared imports beyond `assets.ts`) → 1.4 → 1.5. Worth a 2-worktree split for 1.2 + 1.3.

**Verification gate.** `bun test` green (no test changes; the existing `test/perk-choice-ui.test.ts` still passes because `perk-choice-ui.ts` is untouched). `bun run build` + visual screenshot of `dist/debug-gui/index.html`.

**Commit.** `feat(progress): ui-borders 9-slice helpers + cookbook fixture`.

### Phase 2 — perk-choice-ui rewrite

**Goal.** Swap the `Graphics.rect` internals of `perk-choice-ui.ts` for `Panel` + `Button[]`. Keep all exports byte-stable. Production modal looks like an RPG menu.

| Task | Core LOC | Tests LOC | Debug-fixture LOC | Realised w/ 2.5× | Touches |
|---|---|---|---|---|---|
| 2.1 `src/main.ts` + `src/main-debug.ts` — extend `assets:` (or insert pre-boot `Assets.load`); pass loaded `Record<name, Texture>` into `make_perk_choice_ui` (via a new opt field `get_ui_textures: () => UiTextures`) | 30 | 0 | 0 | ~75 | `src/main.ts`, `src/main-debug.ts` |
| 2.2 `src/systems/perk-choice-ui.ts` rewrite — replace `backdrop: Graphics` with `Panel`; replace `button_layer: Graphics` with `Button[]`; preserve `button_rects`, `button_at`, `make_perk_choice_ui`, `PerkChoiceUI`, `PerkChoiceUIOpts`, `ButtonRect` exports; preserve text positions; extend `redraw()` to call `button[i].set_state("idle")` (no hover wiring in production) and update label text via per-button setters; preserve `attach_pointer` body unchanged | 280 | 0 | 0 | ~700 | `src/systems/perk-choice-ui.ts` |
| 2.3 Verification — run `bun test` (expect all 75 tests green, especially the 9 perk-choice-ui hit-test tests + 8 replay tests); manual `bun run build && open dist/index.html`; verify modal renders panel-bordered, title visible, 3 buttons readable, keyboard 1/2/3 + click still picks perk | 0 | 0 | 0 | 0 | (verification) |

**Sub-phase budget.** Core 310 LOC source. Realised: **~775 LOC** including comments + the existing 206-LOC file's expansion.

**Test coverage.** `test/perk-choice-ui.test.ts` covers the hit-test math exhaustively; the rewrite keeps it green by leaving `button_rects` + `button_at` byte-identical (constants + `make_rect` formula don't move). No new unit tests required. If the rewrite introduces a `make_perk_choice_ui` opt that wants validation, add an inline doc-test asserting the panel/button shape — optional, low priority.

**Risk note.** `Button.set_state("pressed")` on click is a nice-to-have but adds **animation timing concern** (when does it revert? — likely the modal closes immediately on pick, so the pressed state is invisible). Default: only call `set_state("idle")` in `redraw()`; skip the pressed transition entirely. If the user wants visual click feedback later, wire a 100 ms "pressed → idle" transition in `attach_pointer`'s handler before calling `opts.on_pick`. Documented as future work in `UI-PROPOSED-AGENTS-UPDATES.md`.

**Parallelisation.** 2.1 ∥ 2.2 are tempting (different files) but 2.2 imports from 2.1's `UiTextures` type. Run 2.1 first, then 2.2. Single coder, sequential.

**Verification gate.** `bun test` byte-stable (75/75 green, same world_hash assertions). `bun run build` + manual smoke: open `dist/index.html`, force a level-up via `/grant-xp 100` in the palette, confirm modal renders with 9-slice panel + buttons.

**Commit.** `feat(progress): 9-slice perk-choice modal via Panel + Button helpers`.

### Phase 3 — docs

**Goal.** Capture friction + conventions for the next agent.

| Task | Core LOC | Tests LOC | Debug-fixture LOC | Realised w/ 2.5× | Touches |
|---|---|---|---|---|---|
| 3.1 `FRICTION.md` — append §17–§21 (NineSliceSprite + filter interaction, asset-loading-race choice, slice-inset derivation, separate debug fixture rationale, hover-not-wired-in-production) | 60 | 0 | 0 | ~150 | `FRICTION.md` |
| 3.2 `UI-PROPOSED-AGENTS-UPDATES.md` — staged updates covering (a) panel/button reusable shape, (b) NineSliceSprite + Kenney convention, (c) `forge.ui` gate progress 1/3, (d) debug-fixture-per-visual-concern norm | 200 | 0 | 0 | ~500 | `UI-PROPOSED-AGENTS-UPDATES.md` |
| 3.3 Verification — typo pass, link check, commit | 0 | 0 | 0 | 0 | (verification) |

**Sub-phase budget.** Doc 260 LOC source. Realised: **~650 LOC**.

**Commit.** `docs(progress): friction + AGENTS proposals for ui-borders pass`.

### Totals

| Phase | Core | Tests | Debug | Realised total |
|---|---|---|---|---|
| 1 | 245 | 0 | 140 | ~960–1150 |
| 2 | 310 | 0 | 0 | ~775 |
| 3 | 260 (docs) | 0 | 0 | ~650 |
| **Grand** | **815** | **0** | **140** | **~2400–2600** |

This is in line with the AGENTS.md observation that PLAN.md §7 budgets understate by ~3×: the raw "perk-choice-ui rewrite" task reads as ~200 LOC of swap, but realised at ~2400–2600 LOC across helpers + fixture + docs + the existing-file expansion.

---

## 7. Breaking changes

**None.** Every public export from `perk-choice-ui.ts` keeps its name, type, and behaviour:

- `button_rects: ReadonlyArray<ButtonRect>` — unchanged values (same constants).
- `button_at(x, y): number | null` — unchanged math.
- `ButtonRect` — unchanged shape.
- `PerkChoiceUI` — unchanged shape (Container + System + attach_pointer).
- `PerkChoiceUIOpts` — gains an OPTIONAL `get_ui_textures?` field; existing callers passing only the four mandatory fields keep working (or, if we make `get_ui_textures` required, both `main.ts` + `main-debug.ts` get a one-line addition that's already in Phase 2.1). **Recommend required.**

Net: a one-line addition to two boot files. Not a breaking change at the workspace boundary (progress is consumer-internal).

---

## 8. Replay + snapshot regression checklist (verification phase 2)

- [ ] `bun test` — all 75 tests green (8 in `replay.test.ts`, 9 in `perk-choice-ui.test.ts`, ~58 others).
- [ ] `replay.test.ts` "snapshot round-trip mid-replay preserves world hash" — byte-stable.
- [ ] `replay.test.ts` "two consecutive replay runs produce byte-identical world hashes" — byte-stable.
- [ ] `replay.test.ts` "disk-format round-trip: JSON.stringify -> safeParse -> restore preserves world hash" — byte-stable.
- [ ] `perk-choice-ui.test.ts` all 9 tests pass — values for `BUTTON_W`, `BUTTON_H`, `BUTTON_GAP`, `BUTTON_COUNT` unchanged.
- [ ] Manual: production `dist/index.html` modal renders with panel border + buttons; keyboard 1/2/3 still picks; click still picks; perk applies; level continues.
- [ ] Manual: debug fixture `dist/debug/index.html` (the existing level-up loop) still renders the modal correctly post-rewrite.
- [ ] Manual: GUI cookbook `dist/debug-gui/index.html` renders panel + button states cleanly.

---

## 9. Future work (out of scope, but listed for `UI-PROPOSED-AGENTS-UPDATES.md` §future)

- **Pressed-state animation** — 100 ms ease on click. Trivial; not in this plan.
- **Hover wiring in production** — `pointermove` → `set_state("hover")`. Game-design call (does it add value?); not in this plan.
- **HUD restyling** — `src/systems/hud.ts` could adopt `Panel` for the top-right LV/XP/HP/stats card. Lives on `app.render.debug_overlay` (unfiltered, canvas-pixel space) — needs separate scale story. Defer to a HUD-specific pass.
- **`forge.ui` promotion** — when boss (consumer #2) ships and hub or main makes #3, gather the panel/button shape into `@f0rbit/forge/ui`. Per `PLAN.md` §5.
- **Theming** — Kenney ships brown / blue / green / red variants. A `theme: "brown" | "blue" | ...` arg on `make_panel` / `make_button` falls out naturally once two consumers want different theme palettes.

---

## 10. devpad tasks

The devpad MCP isn't wired into the active session (verified at plan time). When devpad is reachable, mirror the table below; until then this section serves as the canonical task list and the verification coder can use `TaskCreate` in-session.

| # | Title | Priority | Depends on | Notes |
|---|---|---|---|---|
| 1 | progress GUI: asset drop (manual) | high | — | User downloads + extracts Kenney pack to `subsystems/progress/public/ui-borders/`. |
| 2 | progress GUI: `src/ui/assets.ts` + Option B asset wiring | high | 1 | Phase 1.1. |
| 3 | progress GUI: `src/ui/panel.ts` | high | 2 | Phase 1.2. Parallel with #4. |
| 4 | progress GUI: `src/ui/button.ts` | high | 2 | Phase 1.3. Parallel with #3. |
| 5 | progress GUI: cookbook fixture + build wiring | high | 3, 4 | Phase 1.4 + 1.5. |
| 6 | progress GUI: Phase 1 verification + commit | high | 5 | Visual smoke gate. |
| 7 | progress GUI: perk-choice-ui rewrite + boot asset wiring | high | 6 | Phase 2.1 + 2.2. |
| 8 | progress GUI: Phase 2 verification + commit | high | 7 | Replay + perk-choice-ui tests byte-stable. |
| 9 | progress GUI: FRICTION.md §17–§21 | medium | 8 | Phase 3.1. |
| 10 | progress GUI: UI-PROPOSED-AGENTS-UPDATES.md | medium | 8 | Phase 3.2. Parallel with #9. |
| 11 | progress GUI: Phase 3 commit + final review | medium | 9, 10 | Doc-only commit. |

---

## 11. FRICTION.md slots reserved (Phase 3.1)

For the next agent that hits the same friction, the slots are pre-planned:

**§17 — NineSliceSprite + lighting filter + RenderTexture pipeline.** The modal lives on `app.stage` (sibling of `surface_sprite`), so the `app.render.world` lighting filter does NOT touch it. Confirmed at cookbook fixture in Phase 1. If a future consumer puts a `NineSliceSprite` INSIDE `app.render.world` (don't), the filter applies — at which point the 9-slice corner regions will get darkened in unseen areas. Use `app.render.debug_overlay` (unfiltered) or an `app.stage` sibling for any 9-slice that wants consistent brightness.

**§18 — Option B asset wiring chosen over lazy `Texture.from()`.** Phase 1 picked Option B (pre-boot `Assets.load([...urls])`) because (a) it's the established forge pattern for atlases, (b) `NineSliceSprite` rendered with a not-yet-decoded `Texture` shows a blank frame for ~1 tick — visible on slow connections. The lazy approach was rejected; document if a future consumer reverts.

**§19 — Slice-inset derivation by visual inspection.** Kenney's pack ships borders that are visually 4–8 px on 1x art, 8–16 px on 2x. The exact pixel inset is sprite-specific and not documented in the pack. Derive once per sprite by opening the PNG in an image editor, measure the border thickness, set the inset slightly tighter than the visible edge (so the centre region tiles cleanly without bleeding the corner art). Module-level constants in `panel.ts` + `button.ts` document the choice with the source filename.

**§20 — `/debug-gui/` is a SEPARATE fixture from `/debug/`.** Conflating "UI cookbook" with the existing "level-up loop" fixture would muddle the responsibility of each. `/debug/` exists to validate the gameplay state machine + persistence; `/debug-gui/` exists to validate visual primitives. Separate boot, separate plugin (or none), separate HTML. Pattern: one debug fixture per concern.

**§21 — Hover not wired in production despite `Button.set_state("hover")` shape.** The `make_button` factory exposes `set_state("idle" | "hover" | "pressed")` because the cookbook fixture needs it for visual regression. Production `perk-choice-ui.ts` calls only `set_state("idle")` — the primary input is keyboard 1/2/3 (no pointer position), and pointer hover adds animation timing complexity (hover-on, hover-off) that doesn't justify itself for a 3-button modal. If a future consumer with many buttons wants hover, opt in at the call site (wire `pointermove` → `set_state("hover")`). The factory shape stays the same.

---

## 12. Suggested `AGENTS.md` updates (drafted in `UI-PROPOSED-AGENTS-UPDATES.md` Phase 3.2)

These are proposed AGENTS.md additions emerging from this plan — staged in `subsystems/progress/UI-PROPOSED-AGENTS-UPDATES.md` for user review (not written to AGENTS.md directly, mirroring the arena POLISH precedent):

1. **Rendering conventions → "9-sliced game UI panels + buttons"** — convention for using `NineSliceSprite` with Kenney-style asset packs, slice insets as module constants, raw PNGs preferred over atlas pack until ≥12 assets, asset loading via Option B (pre-boot `Assets.load`).
2. **Architecture patterns → "Reusable UI primitives — game-side until 3rd consumer"** — `subsystems/<sub>/src/ui/{panel,button}.ts` shape, `set_state` + `get_bounds` interface, FORGE-PROMOTION-CANDIDATE header tracking consumers.
3. **Forge promotion candidates table** — add a `forge.ui` row tracking 1/3 consumers (progress as #1, boss likely #2, hub or main likely #3 → promotion at Phase 8 main).
4. **Debug fixture pattern (existing section) → addendum** — "one debug fixture per visual concern" — don't conflate a UI cookbook with a gameplay-state fixture.

---

## 13. Open design questions discovered while reading the current code

These are not blockers. Listed for transparency; the recommended call is parenthesised.

- **Q1 — Should `Button` accept a `label: string` constructor arg + own its `Text` child, or should `perk-choice-ui.ts` continue to manage `Text` children separately?** (Recommend: `Button` accepts an optional `label` for the cookbook fixture's convenience, but `perk-choice-ui.ts` keeps managing its own `Text` children because it wraps two lines per button — name + modifier — and font styles diverge between the two. The cookbook uses single-line labels.)
- **Q2 — Should `make_panel` return `{ container }` or just `Container`?** (Recommend: `{ container }` for parity with `make_button`'s `{ container, set_state, get_bounds }`. Future-proofs adding methods without breaking the call site.)
- **Q3 — Is `subsystems/progress/src/ui/` the right path, or `subsystems/progress/src/systems/ui/`?** (Recommend: `src/ui/`. It's not a system; it's primitives. Matches the convention loot would use if it had reusable UI helpers.)
- **Q4 — Should the cookbook fixture exercise `get_bounds()` (e.g. draw a red rect around each button) for visual debugging?** (Recommend: yes, opt-in via URL `?bounds=1`. ~10 LOC; useful for verifying that `get_bounds()` matches the rendered button.)
- **Q5 — Will the Kenney pack ship distinct `idle / hover / pressed` PNGs, or do we need to tint a single base?** Cannot verify without the user's asset drop. The plan handles both via the `button.ts` fallback (`tint` on a single texture if separate states aren't shipped).

---

## 14. Reference paths

| Topic | Path |
|---|---|
| Target file (rewrite) | `subsystems/progress/src/systems/perk-choice-ui.ts` |
| Hit-test test (must stay green) | `subsystems/progress/test/perk-choice-ui.test.ts` |
| Replay test (must stay byte-stable) | `subsystems/progress/test/replay.test.ts` |
| Snapshotter (unchanged) | `subsystems/progress/src/snapshot.ts` |
| Production boot | `subsystems/progress/src/main.ts` |
| Existing debug fixture boot | `subsystems/progress/src/main-debug.ts` |
| Pixi v8 NineSliceSprite docs | <https://pixijs.download/release/docs/scene.NineSliceSprite.html> |
| Kenney pack | <https://kenney-assets.itch.io/fantasy-ui-borders> |
| Atlas tooling precedent (not used; raw PNGs chosen) | `tools/gen-walls-autotile-atlas.ts` |
| Modal-on-app.stage precedent | `subsystems/loot/src/main.ts` |
| AGENTS.md "Game UI overlays — app.stage sibling, mirror surface_sprite" | `~/dev/echo/AGENTS.md` |
| AGENTS.md "Crisp text recipe" | `~/dev/echo/AGENTS.md` |
| AGENTS.md "Debug fixture pattern" + "Debug build pipeline rename" | `~/dev/echo/AGENTS.md` |
| AGENTS.md "Static config NOT in snapshot" | `~/dev/echo/AGENTS.md` |
| Unmerged sibling proposal precedent | `subsystems/arena/POLISH-PROPOSED-AGENTS-UPDATES.md` |
| `forge.ui` gate rationale | `subsystems/loot/PLAN.md` §373 |
| LOC multiplier rationale | `~/dev/echo/AGENTS.md` "PLAN.md §7 LOC budgets understate by ~3×" |
