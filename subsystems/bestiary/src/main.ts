import { boot } from "@f0rbit/forge/pixi";
import { Rectangle } from "pixi.js";
import { game_bindings } from "./bindings.ts";
import { visual_pos_c } from "./components.ts";
import { g } from "./grid.ts";
import { game_plugin } from "./plugin.ts";
import { make_debug_overlay } from "./systems/debug-overlay.ts";
import { make_light_filter } from "./systems/light.ts";
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
	const light = make_light_filter(design);
	app.render.world.sortableChildren = true;
	const apply_filter_area = (): void => {
		const vp = app.render.viewport();
		app.render.world.filterArea = new Rectangle(0, 0, vp.view.width, vp.view.height);
	};
	apply_filter_area();
	app.render.world.filters = [light.filter];
	game_plugin(app.world, app.schedule, { telegraph_render, debug_overlay, light });
	globalThis.addEventListener("resize", () => {
		app.render.resize(globalThis.innerWidth, globalThis.innerHeight);
		apply_filter_area();
	});
	app.start();
};

main();
