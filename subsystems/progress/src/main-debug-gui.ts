import { boot } from "@f0rbit/forge/pixi";
import { Container, Graphics, Text } from "pixi.js";
import { load_ui_assets } from "./ui/assets.ts";
import { make_panel } from "./ui/panel.ts";
import { make_button, type Button } from "./ui/button.ts";
import { g } from "./grid.ts";

// main-debug-gui.ts — UI COOKBOOK fixture. Boots a stripped Pixi app (no
// game plugin, no input wiring, no game systems) so the only thing on screen
// is the 9-slice primitives under visual test:
//
//   - one centred panel (200×120, design-space)
//   - three buttons (idle / hover / pressed states)
//   - a "Panel sample" title text + a small label
//
// Pointer-move on the middle button toggles its visible state between idle
// and hover for live regression-test of the tint-fallback path. Opt-in URL
// param `?bounds=1` overlays a red rectangle around each button using
// `button.get_bounds()` for visual debugging (plan §13 Q4).
//
// Deployed at /echo/progress/debug-gui/ via package.json build script.
// Per AGENTS.md "Debug fixture pattern" + plan §5 / FRICTION.md §20:
// one debug fixture per visual concern. This is SEPARATE from /debug/
// (which validates the level-up + save state machine).
//
// Pixel text: Press Start 2P, `resolution: 1`, no scale.set — see echo
// AGENTS.md "Pixel font variant". main awaits document.fonts.ready
// before boot so glyphs are decoded on first frame.

const design = { width: g.cols * g.tile, height: g.rows * g.tile };

const PANEL_W = 200;
const PANEL_H = 120;
const PANEL_X = Math.round((design.width - PANEL_W) / 2);
const PANEL_Y = Math.round((design.height - PANEL_H) / 2);

const BTN_W = 48;
const BTN_H = 24;
const BTN_GAP = 6;
const BTN_ROW_W = 3 * BTN_W + 2 * BTN_GAP;
const BTN_X0 = Math.round((design.width - BTN_ROW_W) / 2);
const BTN_Y = PANEL_Y + 56;

const pixel_text = (text: string, style: Record<string, unknown>): Text => {
	return new Text({ text, style, resolution: 1 });
};

const TITLE_STYLE = {
	fontFamily: "Press Start 2P",
	fontSize: 16,
	fill: 0xffffff,
	stroke: { color: 0x000000, width: 3 },
} as const;

const LABEL_STYLE = {
	fontFamily: "Press Start 2P",
	fontSize: 8,
	fill: 0xc0c0c8,
} as const;

const main = async (): Promise<void> => {
	// Pre-boot: prime Pixi's Assets cache so NineSliceSprite has decoded
	// textures on first tick. Option B per assets.ts header.
	const ui = await load_ui_assets();

	// Wait for web fonts (Press Start 2P) before boot — `fonts.load(...)`
	// (not just `fonts.ready`) is needed to actually fetch the .woff2 from
	// the Google Fonts CDN. See main.ts header note + echo AGENTS.md
	// "Pixel font variant".
	await document.fonts.load("8px 'Press Start 2P'");

	const r = await boot({
		mount: "#root",
		window: { width: globalThis.innerWidth, height: globalThis.innerHeight },
		camera: {
			design,
			mode: "extend",
			min: design,
			pixel_perfect: true,
		},
		debug: true,
		app_id: "progress-debug-gui",
	});
	if (!r.ok) {
		console.error("boot failed", r.error);
		return;
	}
	const app = r.value;

	// Modal-on-app.stage convention (AGENTS.md "Game UI overlays").
	const stage = app.app.stage;
	const overlay = new Container();
	overlay.label = "ui.cookbook.overlay";

	// Insert just below the palette overlay so debug HUDs stay on top.
	const palette_idx = stage.getChildIndex(app.render.palette_overlay);
	stage.addChildAt(overlay, palette_idx);

	const apply_overlay_viewport = (): void => {
		const vp = app.camera.viewport();
		overlay.scale.set(vp.scale, vp.scale);
		overlay.position.set(vp.offset.x, vp.offset.y);
	};
	apply_overlay_viewport();

	// Background panel.
	const panel = make_panel({ texture: ui.panel, width: PANEL_W, height: PANEL_H });
	panel.container.position.set(PANEL_X, PANEL_Y);
	overlay.addChild(panel.container);

	// Title text.
	const title = pixel_text("Panel sample", TITLE_STYLE);
	title.anchor.set(0.5, 0);
	title.position.set(design.width / 2, PANEL_Y + 12);
	overlay.addChild(title);

	// Three buttons exercising the 3 visual states.
	const buttons: Button[] = [];
	const states: Array<"idle" | "hover" | "pressed"> = ["idle", "hover", "pressed"];
	for (let i = 0; i < 3; i++) {
		const btn = make_button({ idle_tex: ui.button, width: BTN_W, height: BTN_H });
		btn.container.position.set(BTN_X0 + i * (BTN_W + BTN_GAP), BTN_Y);
		btn.set_state(states[i]!);
		overlay.addChild(btn.container);
		buttons.push(btn);

		const label = pixel_text(states[i]!, LABEL_STYLE);
		label.anchor.set(0.5, 0);
		label.position.set(BTN_X0 + i * (BTN_W + BTN_GAP) + BTN_W / 2, BTN_Y + BTN_H + 4);
		overlay.addChild(label);
	}

	// Footer label.
	const footer = pixel_text("3 buttons: idle / hover / pressed", LABEL_STYLE);
	footer.anchor.set(0.5, 0);
	footer.position.set(design.width / 2, PANEL_Y + PANEL_H - 16);
	overlay.addChild(footer);

	// Opt-in ?bounds=1 — red rect around each button via get_bounds().
	const search = new URLSearchParams(globalThis.location.search);
	if (search.get("bounds") === "1") {
		const gfx = new Graphics();
		gfx.label = "ui.cookbook.bounds";
		for (const btn of buttons) {
			const b = btn.get_bounds();
			gfx.rect(b.x, b.y, b.w, b.h).stroke({ color: 0xff3030, width: 1 });
		}
		overlay.addChild(gfx);
	}

	// Pointer-move on the middle button → live idle↔hover swap. Lets a
	// human visually confirm the tint-fallback transition without keyboard
	// or game wiring.
	const canvas = app.canvas();
	if (canvas) {
		const middle = buttons[1]!;
		canvas.addEventListener("pointermove", (e: PointerEvent) => {
			const rect = canvas.getBoundingClientRect();
			const cx = e.clientX - rect.left;
			const cy = e.clientY - rect.top;
			const vp = app.camera.viewport();
			// Inverse of the overlay transform: subtract offset, divide by scale.
			const dx = (cx - vp.offset.x) / vp.scale;
			const dy = (cy - vp.offset.y) / vp.scale;
			const b = middle.get_bounds();
			const inside = dx >= b.x && dx <= b.x + b.w && dy >= b.y && dy <= b.y + b.h;
			middle.set_state(inside ? "hover" : "idle");
		});
	}

	globalThis.addEventListener("resize", () => {
		app.render.resize(globalThis.innerWidth, globalThis.innerHeight);
		apply_overlay_viewport();
	});

	app.start();
};

main();
