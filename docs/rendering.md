# Rendering & UI conventions

> **Read this in full before touching anything visual** — sprites, text, HUD, modals, overlays, lighting, camera, particles, debug fixtures. Every recipe here replaced a shipped bug or a rejected alternative; deviating means re-discovering why.
>
> The visual **contract** (palette tokens, font choice, lighting moods, shell screens, HUD placement, juice bar) is `docs/design-language.md` — this file holds the implementation recipes.

## Quick checklist

- [ ] DOM pointer events → world coords via `event_to_world` — never hand-rolled scale math.
- [ ] `pos_c` for cell-aligned entities is the cell **CENTER** — never add `+ g.tile / 2`.
- [ ] Game UI modals go on `app.stage` as a `surface_sprite` **sibling** via `addChildAt` — never inside `app.render.world`, never plain `addChild`.
- [ ] Text uses the correct recipe from the table below (crisp vs pixel font — they are opposites).
- [ ] Web fonts: `await document.fonts.load(...)` before `boot()` in **every** entry point.
- [ ] UI textures load via pre-boot `Assets.load` (`load_ui_assets()`), never lazy `Texture.from()`.
- [ ] Camera shake via `app.render.set_screen_offset` — never `app.stage.position` or `app.render.world.position`.
- [ ] Explicit `sprite_c.z`: 1 floor / 2 wall / 3 entities.
- [ ] Non-trivial visual systems ship a debug fixture page (one fixture per visual concern).

## Container map — where things render

| Container | Lighting filter? | Use for |
|-----------|------------------|---------|
| `app.render.world` | YES (darkened in unseen areas) | Game entities, floors, walls |
| `app.render.debug_overlay` | NO (canvas-pixel space) | Debug HUDs, markers, FOV circles, click visualizations |
| `app.stage` sibling of `surface_sprite` | NO (design space once mirrored) | Game UI: modals, dialogue panels, perk choice, shell screens |

## Canvas → world coords

Use `event_to_world(e, canvas, app.camera)` from `@f0rbit/forge/pixi` for DOM pointer events. It handles `getBoundingClientRect` + CSS-pixel-to-canvas-buffer DPR scaling + forge's two-stage RenderTexture pipeline. **Never reimplement `fit_scale` math** — forge's `Container.worldTransform` reports identity for `app.render.world` because the actual scale lives on the offscreen-composited `surface_sprite` on `app.stage`, which is invisible to `toLocal`.

## Cell coordinates are CENTER, not top-left

`g.cell_to_world(cx, cy)` returns `{ cx*tile + tile/2, cy*tile + tile/2 }`. So `pos_c` for any cell-aligned entity (floors, walls, mobs) is already the cell center. Sprites with `anchor: { x: 0.5, y: 0.5 }` render correctly with NO additional offset. **Don't add `+ g.tile / 2` to coords retrieved from `pos_c`** — that bug bit `wall-debug.ts` and `debug-overlay.ts` independently; both fixed.

## Game UI overlays — `app.stage` sibling, mirror `surface_sprite`

Primary game UI (inventory modal, dialogue panel, perk-choice overlay) goes on `app.stage` as a **sibling of `surface_sprite`**, NOT inside `app.render.world` (which gets the lighting filter), NOT on `app.render.debug_overlay` (semantically reserved for debug HUDs).

The overlay container must manually mirror `surface_sprite.scale.x` and `surface_sprite.position.{x,y}` so design-space layout works. Apply the mirror **once at boot** AND **on every `app.render.resize()` callback** — NOT per-tick (wasted work for state that changes only on resize).

`event_to_world` works for hit-testing because the overlay shares `surface_sprite`'s design-coord system once mirrored. See `subsystems/loot/src/main.ts` and loot FRICTION.md §5.

If a `NineSliceSprite` goes INSIDE `app.render.world` (don't), the lighting filter applies and the slice corner regions get darkened in unseen areas — even though the modal is "above" gameplay logically. See progress FRICTION.md §17.

### Sibling z-order in `app.stage` — `addChildAt(idx)`, not `addChild`

Forge's built-in `app.stage` children render bottom-to-top in this order: `surface_sprite`, `debug_overlay`, `palette_overlay`. To insert a new sibling deterministically between them:

```ts
const idx = app.app.stage.getChildIndex(palette_overlay);
app.app.stage.addChildAt(my_overlay, idx);
```

Plain `app.app.stage.addChild(my_overlay)` always appends at the top — wrong if you want the modal below the palette overlay. Note `app.app.stage` (the underlying Pixi `Application.stage`) vs `app.stage` (a re-export convenience). See `subsystems/loot/src/main.ts:120` and loot FRICTION.md §6.

## Camera shake — `app.render.set_screen_offset` (forge ≥ 0.4.3)

Use `app.render.set_screen_offset(dx, dy)`. This writes through to `surface_sprite.position` in window coords — 1 px shake = 1 device pixel of jitter regardless of integer scale.

Do NOT mutate `app.stage.position` (shakes the HUD and palette UI) or `app.render.world.position` (shifts content inside the offscreen RenderTexture at design resolution — at 6× scale, 1 design-px = 6 device-px of jitter, way too much). `app.render.world` has identity transform; the design→window scale lives on the `surface_sprite` child of `app.stage`.

Shake math runs in the `render` stage AFTER `forge.render`. Magnitude push happens in `update` after combat; the apply system samples seeded jitter and decays each frame. See `subsystems/arena/src/systems/camera-shake.ts` and arena FRICTION.md §12.

## Lighting filter is the right primitive for cosmetic flashes (no FOV needed)

`@f0rbit/forge/light`'s `make_light_system` is useful even when the subsystem has no FOV. Configure `ambient: [1, 1, 1]` (filter is visually transparent until FX lights are added) plus an eye-light covering the whole arena: `radius_cells: Math.max(g.cols, g.rows) * 2`, `intensity: 1`, `falloff: 0.01`. Screen-flash + hit-glow lights then add color on top.

Reuses forge's two-shader path (WebGL + WebGPU) — no one-off Graphics overlay management. Cost ~0.2 ms/frame on integrated GPUs. See `subsystems/arena/src/main.ts` and arena FRICTION.md §10.

## Wall sprites + autotile

Wall autotile ships in `@f0rbit/forge/autotile` (v0.5.0+) implementing **Godot 3x3 minimal autotile** against the 0x72 `atlas_walls_low-16x16.png` sheet, which was designed for exactly this algorithm. Don't go back to 4-bit bitmask — the resulting corner / T-junction tiles don't visually connect because 0x72's named frames (`wall_mid`, `wall_top_left`, etc.) were designed for hand-placed 16×32 layered rendering, not for a 16-tile bitmask grid.

The algorithm: 8-direction neighbor sample → per-corner state (OUTER/SIDE_A/SIDE_B/CONCAVE/FILLED) → 47-entry lookup → tile (col, row). Diagonal-gating rule: a diagonal neighbor only matters when both its adjacent cardinals are also walls (collapses 256 raw 8-neighbour patterns onto 47 unique tiles). Snapshot tests in `test/wall-autotile.test.ts` + `test/fixtures/pattern-to-tile.json` regression-guard the mapping.

If we ever switch sprite packs: the new pack's wall sheet must be authored to Godot 3x3 minimal (or supply a custom lookup table conforming to the same corner-state interface). Other autotile conventions (RPG Maker XP, Wang/blob) need different lookups.

### Walls render on top of floors via explicit z-order

Wall sprite frames have transparent edges (especially side/edge pieces — designed to show floor through them). So every cell — wall AND floor — gets a floor entity (giving it a floor sprite). Walls get an additional `wall_c` entity, which gets a wall sprite on top via autotile. Z-ordering: `sprite_c.z` = 1 (floor) / 2 (wall, exit) / 3 (player, mobs); `world.sortableChildren = true`. Insertion order is unstable because `wall_autotile_system` runs at startup but `sprite_attach_system` runs every post-stage tick — explicit z is the only reliable solution.

### Tiled floors + perimeter walls — every subsystem

All subsystems with a 20×11 single-room arena render:

- A `floor_c` entity in **every** cell (sprite `floor_1`, z=1).
- A `wall_c` entity in every **perimeter** cell (sprite via `wall_autotile_system` from `@f0rbit/forge/autotile`, z=2).

Game entities (player, enemies, projectiles, pickups) sit at z=3. The 0x72 floor frames have full opaque coverage; the 0x72 wall frames have transparent edges (designed to show floor through them) — hence floor + wall **co-spawn at the same perimeter cell**, with explicit z-order resolving stacking.

Spawn reservations (player spawn, pickup placement, enemy spawn) MUST exclude wall cells. Visual walls are **NOT collision-blocking** — existing `g.in_bounds` clamping (arena) or cell-step move guards (loot, progress) prevent the player from leaving the playable area.

Per the "No `@echo/shared`" rule — `walls-autotile.{png,json}` is **duplicated per subsystem** under `public/`. Forge ships no binaries; duplication is the cost of the per-subsystem-asset rule.

Established as standard in Phase 5.9.0–5.9.3 of the polish pass.

## Text recipes

Two recipes. They are **opposites** — applying the wrong one produces blurry text either way.

| Recipe | When to use | `resolution` | `text.scale.set(...)` | `fontSize` |
|--------|-------------|--------------|------------------------|------------|
| Crisp anti-aliased | system monospace, serif, sans (forge's built-in HUD font) | 4 | 0.5 if container scales > 1, else none | 2× design size (e.g. design 8 → store 16) |
| Pixel font | Press Start 2P, VT323, Pixelify Sans | 1 | NEVER | integer multiple of font's native grid (PS2P: 8 / 16 / 24) |

### Crisp text — `resolution: 4` per-Text, `scale: 0.5` when container scales

All `pixi.Text` constructors get `resolution: 4`. The follow-up `text.scale.set(0.5)` depends on the parent container:

| Parent | `resolution` | `text.scale.set(...)` |
|--------|--------------|------------------------|
| `app.render.world` (lighting-filtered) | 4 | 0.5 |
| `app.render.debug_overlay` (canvas-pixel space) | 4 | — (no scale) |
| `app.stage` modal mirroring `surface_sprite` (loot inventory, progress perks, arena shell screens) | 4 | 0.5 |

The 4× super-sample renders the glyph cache at higher DPI; the 0.5 scale takes the displayed Text back to design-space dimensions. **Net effective on-screen DPI: 2× the design canvas.** Without this, Pixi v8 samples the cached glyph texture inappropriately when the container scales > 1 — text looks aliased + blurry.

Practical consequence for modal text (any place `scale.set(0.5)` is in play): **double the stored `fontSize` and `wordWrapWidth`** so the visible size + wrap behaviour match the original design. E.g. a design-space 8 px label with `wordWrapWidth: 78` becomes `fontSize: 16` + `wordWrapWidth: 156` after the recipe; on-screen result is 8 px visible at 4× DPI cache.

Established by commit `f1614a6` (bestiary wall-debug) for `app.render.world`; extended to `app.stage` modal overlays by arena shell screens (Phase 5.9.4); swept across loot HUDs + progress HUDs + arena debug overlay in Phase 5.9.5.

### Pixel font variant — `resolution: 1`, NO `scale.set`, integer-multiple `fontSize`

The Crisp text recipe is **WRONG for pixel fonts** (Press Start 2P, VT323, Pixelify Sans, etc.). Pixel fonts ship a baked grid; super-sampling at `resolution: 4` + downscaling at `scale.set(0.5)` re-rasterises that grid through bilinear filtering and destroys the pixel-perfect look. Result is a blurry pixel font with anti-aliased edges that defeats the whole point.

Correct recipe for pixel fonts (any parent):

```ts
const PIXEL_STYLE = {
  fontFamily: "Press Start 2P",  // or VT323, Pixelify Sans, etc.
  fontSize: 8,                    // or integer multiple — 16, 24, 32 for PS2P's 8px grid
  fill: 0xffffff,
} as const;
const t = new Text({ text, style: PIXEL_STYLE, resolution: 1 });
// NO `t.scale.set(...)` — the source IS the display.
```

**Font loading.** Web fonts need an explicit fetch trigger before Pixi measures glyphs. CDN `<link href="...Press+Start+2P...">` registers the @font-face but does NOT fetch the .woff2 until something paints with it. `await document.fonts.ready` alone resolves immediately (no in-flight loads) and `document.fonts.status === "loaded"` gives a misleading green light. Force the fetch with `await document.fonts.load("8px 'Press Start 2P'")` before `boot()`; confirm with `document.fonts.check("8px 'Press Start 2P'")`. **Every entry point needs its own `fonts.load(...)`** — main.ts, main-debug.ts, main-debug-gui.ts — because each page load is a fresh font registry. The `debug-gui` cookbook fixture bit the no-fetch trap during the progress font swap (progress FRICTION.md §26).

**HTML wiring.** Each subsystem HTML entry adds the Google Fonts `<link>` triplet (preconnect googleapis + gstatic + the stylesheet) to the `<head>`. Avoids a CSS @import waterfall.

**Effective glyph width undershoots reported width by ~1-2px** for Press Start 2P at fontSize 8 (font-metric quirk — default Pixi letterspacing adds inter-glyph space the advance-width metrics under-report). Set `wordWrapWidth` to `BUTTON_W - 16` (8px padding each side) rather than `BUTTON_W - 6` to avoid right-edge clipping on long words like "Hardened" (progress FRICTION.md §27).

**Button-size budget for pixel-font labels:** size buttons for the expected longest label in 2 lines of text + 1–2 lines of modifier. For ~12-char perk names: 100px design-space wide is the floor (progress uses 100×60; `3 × 100 + 2 × 8 = 316 ≤ 320` canvas). See progress FRICTION.md §28.

First consumer: progress's perk-choice modal + HUD + dead-screen. See `subsystems/progress/src/systems/perk-choice-ui.ts` for the canonical shape.

## 9-sliced game UI panels + buttons — `NineSliceSprite` + Kenney pack

Game UI (modals, panels, buttons) uses Pixi v8's `NineSliceSprite` against Kenney-style asset packs (CC0 9-slice PNGs). Convention:

- **Raw PNGs, no atlas.** Until a subsystem has ≥12 distinct UI assets the atlas-packing overhead isn't justified — `NineSliceSprite` accepts a `Texture` directly. The dungeon + walls atlases stay the precedent for ≥40-tile sheets; UI is a different scale.
- **Slice insets as module-level constants** in the wrapper file (`DEFAULT_PANEL_INSETS = { left: 8, top: 8, right: 8, bottom: 8 }` for Kenney's 48×48 borders). The exact pixel inset is sprite-specific and undocumented in the pack — derive once per sprite by measuring the border in an image editor, set the inset slightly tighter than the visible edge, and document the source filename in a header comment. A future asset swap forces a fresh derivation pass + its own constants (progress FRICTION.md §19).
- **Asset loading — pre-boot `Assets.load`.** Wire UI texture URLs into a helper like `subsystems/<sub>/src/ui/assets.ts:load_ui_assets()` and `await` it BEFORE forge's `boot()`. Lazy `Texture.from()` inside the wrappers risks a blank first frame on slow connections — visible flicker exactly when the modal pops. Pixi's `Assets` cache is process-global so later `Texture.from(url)` lookups stay synchronous once loaded (progress FRICTION.md §18).
- **Modal placement.** Per "Game UI overlays" above — NineSlice modals go on `app.stage`, NOT `app.render.world`.
- **Folder hygiene.** Kenney's pack ships subfolders with spaces — rename to kebab-case on disk so URLs are clean (`transparent-border/` not `Transparent%20border/`) per the repo's kebab-case filename convention.

### Reusable UI primitive shapes (game-side until 3rd consumer)

UI primitives live under `subsystems/<sub>/src/ui/` until 3+ subsystems consume them — then they promote to `@f0rbit/forge/ui` (see `docs/forge.md` promotion tracker). Canonical shape (from `subsystems/progress/src/ui/`):

- **`assets.ts`** — `UiTextureName` string-literal union, name → URL map, `load_ui_assets(): Promise<Record<UiTextureName, Texture>>` helper that resolves before forge's `boot()`. (Note: `UiTextures` type currently lives in `perk-choice-ui.ts`; at promotion time it moves to `assets.ts` — progress FRICTION.md §23.)
- **`panel.ts`** — `make_panel({ texture, width, height, insets? }): { container }`. Returns `{ container }` (not the `NineSliceSprite` directly) so callers can `addChild` text / siblings on top without slice math leaking into the public API.
- **`button.ts`** — `make_button({ idle_tex, hover_tex?, pressed_tex?, width, height, label?, insets? }): { container, set_state, get_bounds }`. `set_state("idle" | "hover" | "pressed")` swaps layered NineSlice children OR modulates `idle.tint` when only `idle_tex` is supplied. `get_bounds()` returns `{x, y, w, h}` so pure-function hit-test helpers stay load-bearing. Hover/pressed states exist for the cookbook fixture; production keyboard-driven modals may only ever call `set_state("idle")` — that's fine, opt in at the call site (progress FRICTION.md §21).

Each file carries a `// FORGE-PROMOTION-CANDIDATE` header listing all known consumers + the planned promotion phase.

## `make_eye_follow_system` accepts any `Component<{x, y}>` position

Forge's `make_eye_follow_system` (eye / pupil tracking) is generic over the position component shape — it accepts any `Component<{x, y}>`. Confirmed working for:

- `pos_c` (continuous-motion: arena) — integer-snapped per tick
- `visual_pos_c` (cell-step + tween: loot, progress, bestiary) — lerped per tick

Just pass whichever one the player's eyes should track. Surfaced in Phase 5.9.1 (arena visual parity).

## Debug fixture pattern

For any visual system that's non-trivial (autotiling, lighting, particles, post-processing), ship a `subsystems/<sub>/debug/` companion page alongside the playable one. Pattern (see `dungeon-walk/src/main-debug.ts` + `dungeon-walk/src/debug-plugin.ts` + `dungeon-walk/src/systems/debug-arena-gen.ts`):

- Separate `<page>-debug.ts` entry point (own boot, hard-coded `debug: true`)
- Stripped plugin — no input/AI/lighting/movement — just the visual systems under test
- Hand-crafted arena that deterministically exercises every code path (e.g. all 47 autotile corner-state combos in one layout)
- Auto-enable debug toggles at boot (`echoWallDebug(true)`, etc.)
- Build script: `bun build src/main-debug.ts --outdir dist/debug` + copy `public/*` to `dist/debug/`
- Deployed at `/echo/<sub>/debug/`

Visual fixtures unlock fast iteration (and let agents verify autonomously via Chrome DevTools screenshots) without procedural-dungeon noise + lighting interference.

### One debug fixture per visual concern

When a subsystem ships multiple debug fixtures, each fixture validates exactly one concern. Don't conflate a UI cookbook with a gameplay-state fixture. Example: progress ships two —

- `/echo/progress/debug/` (`src/main-debug.ts`) — validates the level-up state machine + persistence via choreographed XP grants. Real save/restore round-trip, real perk picks, no UI variation exercised.
- `/echo/progress/debug-gui/` (`src/main-debug-gui.ts`) — validates the visual primitives. Every panel + button state on one screen, no gameplay, no input wiring beyond pointer-hover. Title text + idle/hover/pressed buttons rendered as a static cookbook.

Conflating them muddles each fixture's responsibility — a regression in one concern shouldn't require investigating the other. Each fixture gets its own boot, its own (optionally stripped) plugin, its own HTML shell, and its own build-script entry per the rename recipe below. The deploy step's `cp -r dist/. _site/.../<sub>/` picks all fixtures up automatically — no `pages.yml` change needed when adding a new one.

### Debug build pipeline rename

`bun build src/main-debug.ts --outdir dist/debug` emits `dist/debug/main-debug.js`. The build script then `mv`s it to `dist/debug/main.js` so the deployed `dist/debug/index.html` can ship a clean `<script src="./main.js">`. The `debug.html` source in the subsystem root must reference `./main.js`, NOT `./main-debug.js` — the rename happens at build time. Scaffold defaults that ship `./main-debug.js` will 404 in the deployed page. See `subsystems/arena/package.json` build script and arena FRICTION.md §9.
