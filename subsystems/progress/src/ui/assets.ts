import { Assets, type Texture } from "pixi.js";

// assets.ts — centralised name → URL map for the Kenney Fantasy UI Borders
// drop under public/ui-borders/. Returns a typed Record<UiTextureName, Texture>
// so panel.ts / button.ts callers don't hardcode paths.
//
// LOADING STRATEGY — Option B (pre-boot Assets.load): chosen.
// We `Assets.load([...urls])` BEFORE forge's `boot()` so the texture cache is
// populated by the time panel.ts / button.ts ask for handles. Option A (lazy
// `Texture.from(url)` inside the wrappers) was REJECTED because:
//
//   - NineSliceSprite rendered with a not-yet-decoded Texture shows a blank
//     frame for ~1 tick on slow connections — visible flicker on level-up.
//   - Pre-loading mirrors the existing forge pattern for atlases
//     (`boot({ assets: [{ kind: "atlas", ... }] })`).
//
// Pixi's `Assets` cache is process-global, so once `load_ui_assets()` resolves
// the textures stay hot for `Texture.from(url)` synchronous lookups elsewhere.
//
// FOLDER NAMING — kebab-case rename: chosen.
// Kenney's pack ships subfolders with spaces (e.g. `Transparent border/`).
// We renamed to kebab-case on disk (`transparent-border/`) rather than URL-
// encoding (`Transparent%20border/`) so the URLs are clean + match the repo's
// kebab-case filename convention (AGENTS.md "Code style").
//
// ATLAS vs RAW PNGs — raw PNGs chosen.
// Per .plans/progress-gui-overhaul.md §3.6: with ~4 distinct PNGs the atlas
// packing overhead isn't justified. Revisit if the consumer count grows past
// ~12 assets. NineSliceSprite accepts a Texture directly so no atlas needed.

export type UiTextureName = "panel" | "button" | "button_transparent";

// Specific PNG choices made by visual inspection of the Kenney pack. All
// stems are 48×48 px 1-bit (white-outline / blue-tinted variants).
//
// VARIANT BUMP (000 → 009 / 014) — the original 000 selections were
// corner-bracket-only frames; the modal read as "a darkened backdrop
// with three faint button outlines" rather than a real RPG menu. User
// feedback: "the ui still feels a bit lack-luster, i want crisp pixel
// art gui". Mid-range variants of the Kenney pack ship visibly fuller
// 4-sided frames with decorative inner edges — see Kenney pack preview
// images at https://kenney.nl/assets/fantasy-ui-borders. Choices below
// were made by walking the panel/ + border/ folders top-to-bottom; the
// crisp `scaleMode: "nearest"` recipe (below) renders them sharp on
// the design canvas.
//
//   panel  → public/ui-borders/panel/panel-009.png
//            Solid filled backdrop with a thicker 2-pixel decorative
//            border. Used for the perk-choice + dead-screen modals.
//   button → public/ui-borders/border/panel-border-014.png
//            Fuller 4-sided button frame (vs. 000's bare outline). Used
//            for the perk-choice button face. Tinted in button.ts for
//            hover/pressed; pack ships no distinct idle/hover/pressed.
//   button_transparent → public/ui-borders/transparent-border/panel-transparent-border-000.png
//            Optional alternate button face for fixtures wanting a see-through
//            button (debug-gui exercises it for visual variety). Pack only
//            ships 000+001 for this variant family — kept on 000.

const URLS: Record<UiTextureName, string> = {
	panel: "ui-borders/panel/panel-009.png",
	button: "ui-borders/border/panel-border-014.png",
	button_transparent: "ui-borders/transparent-border/panel-transparent-border-000.png",
};

export const ui_texture_urls = (): readonly string[] => Object.values(URLS);

// SCALE MODE — nearest-neighbor sampling per-texture.
//
// Pixi v8 defaults `TextureSource.scaleMode` to "linear" — bilinear interp
// blurs pixel art when stretched. The 48x48 ui-borders get stretched to
// 80x40 buttons + 320x176 panel + the viewport scale (~3x), and bilinear
// at that magnification produces visible smear on the corner brackets.
// Setting per-texture (not globally) keeps the dungeon atlas untouched —
// forge's atlas loader already does the right thing for that path.
export const load_ui_assets = async (): Promise<Record<UiTextureName, Texture>> => {
	const entries = Object.entries(URLS) as ReadonlyArray<[UiTextureName, string]>;
	await Assets.load(entries.map(([, url]) => url));
	const out = {} as Record<UiTextureName, Texture>;
	for (const [name, url] of entries) {
		const tex = await Assets.load(url);
		tex.source.scaleMode = "nearest";
		out[name] = tex;
	}
	return out;
};
