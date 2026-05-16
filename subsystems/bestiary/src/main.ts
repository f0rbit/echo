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

const design = { width: g.cols * g.tile, height: g.rows * g.tile };

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
		grid: g,
		ambient: presets.moon_cavern.ambient,
		eye_radius: 6,
	});

	const brazier_cell = brazier_cells[0]!;
	ls.add({
		pos_cell: [brazier_cell.x, brazier_cell.y],
		color: [1.0, 0.55, 0.25],
		radius_cells: 4,
		intensity: 0.85,
		falloff: 1.6,
		flicker: { kind: "torch", amount: 0.18, seed: 2 },
	});

	const summoner_glow = ls.add({
		pos_cell: [0, 0],
		color: [0.6, 0.3, 0.9],
		radius_cells: 4,
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
		summoner_glow,
	});

	globalThis.addEventListener("resize", () => {
		app.render.resize(globalThis.innerWidth, globalThis.innerHeight);
		apply_filter_area();
	});
	app.start();
};

main();
