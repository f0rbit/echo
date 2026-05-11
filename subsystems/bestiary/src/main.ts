import { boot } from "@f0rbit/forge/pixi";
import { Rectangle } from "pixi.js";
import { brazier_cells } from "./arena-gen.ts";
import { game_bindings } from "./bindings.ts";
import { visual_pos_c } from "./components.ts";
import { g } from "./grid.ts";
import { game_plugin } from "./plugin.ts";
import { make_debug_overlay } from "./systems/debug-overlay.ts";
import { make_light_system, presets } from "./systems/light/index.ts";
import { make_telegraph_render } from "./systems/telegraph-render.ts";

const design = { width: 480, height: 320 };

const main = async (): Promise<void> => {
	const r = await boot({
		mount: "#root",
		window: { width: globalThis.innerWidth, height: globalThis.innerHeight },
		camera: {
			design,
			mode: "extend",
			min: design,
			pixel_perfect: true,
		},
		bindings: game_bindings,
		pos: visual_pos_c,
	});
	if (!r.ok) {
		console.error("boot failed", r.error);
		return;
	}
	const app = r.value;
	const telegraph_render = make_telegraph_render(app.render.world, g);
	const debug_overlay = make_debug_overlay(app.render.world, g);

	const ls = make_light_system({
		design,
		ambient: presets.moon_cavern.ambient,
		max_lights: 16,
	});

	const player_torch = ls.add({
		pos_px: [design.width / 2, design.height / 2],
		color: presets.moon_cavern.default_torch_color,
		radius_px: presets.moon_cavern.default_torch_radius,
		intensity: 0.95,
		flicker: { kind: "torch", amount: 0.12, seed: 1 },
	});

	const brazier_cell = brazier_cells[0]!;
	const brazier_world = g.cell_to_world(brazier_cell.x, brazier_cell.y);
	ls.add({
		pos_px: [brazier_world.x + g.tile / 2, brazier_world.y + g.tile / 2],
		color: [1.0, 0.55, 0.25],
		radius_px: 64,
		intensity: 0.85,
		falloff: 1.6,
		flicker: { kind: "torch", amount: 0.18, seed: 2 },
	});

	const summoner_glow = ls.add({
		pos_px: [0, 0],
		color: [0.6, 0.3, 0.9],
		radius_px: 56,
		intensity: 0.75,
		flicker: { kind: "candle", amount: 0.15, seed: 3 },
	});

	app.render.world.sortableChildren = true;
	const apply_filter_area = (): void => {
		const vp = app.render.viewport();
		app.render.world.filterArea = new Rectangle(0, 0, vp.view.width, vp.view.height);
	};
	apply_filter_area();
	app.render.world.filters = [ls.filter];

	game_plugin(app.world, app.schedule, {
		telegraph_render,
		debug_overlay,
		light: ls,
		player_torch,
		summoner_glow,
	});

	globalThis.addEventListener("resize", () => {
		app.render.resize(globalThis.innerWidth, globalThis.innerHeight);
		apply_filter_area();
	});
	app.start();
};

main();
