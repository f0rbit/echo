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
//   panel  → public/ui-borders/panel/panel-000.png
//            Solid bordered backdrop — used as the modal background.
//   button → public/ui-borders/border/panel-border-000.png
//            Border-only frame — used as the perk-choice button face.
//            (tinted in button.ts for hover/pressed; pack ships no distinct
//             idle/hover/pressed variants.)
//   button_transparent → public/ui-borders/transparent-border/panel-transparent-border-000.png
//            Optional alternate button face for fixtures wanting a see-through
//            button (debug-gui exercises it for visual variety).

const URLS: Record<UiTextureName, string> = {
	panel: "ui-borders/panel/panel-000.png",
	button: "ui-borders/border/panel-border-000.png",
	button_transparent: "ui-borders/transparent-border/panel-transparent-border-000.png",
};

export const ui_texture_urls = (): readonly string[] => Object.values(URLS);

export const load_ui_assets = async (): Promise<Record<UiTextureName, Texture>> => {
	const entries = Object.entries(URLS) as ReadonlyArray<[UiTextureName, string]>;
	await Assets.load(entries.map(([, url]) => url));
	const out = {} as Record<UiTextureName, Texture>;
	for (const [name, url] of entries) {
		out[name] = await Assets.load(url);
	}
	return out;
};
