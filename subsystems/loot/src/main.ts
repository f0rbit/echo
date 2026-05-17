import { boot } from "@f0rbit/forge/pixi";
import { Graphics } from "pixi.js";
import { game_bindings } from "./bindings.ts";
import { visual_pos_c } from "./components.ts";
import { g } from "./grid.ts";
import { game_plugin } from "./plugin.ts";

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
		// Camera follows the smoothed visual position so cell-step movement
		// looks continuous (mirrors bestiary's main.ts).
		pos: visual_pos_c,
	});
	if (!r.ok) {
		console.error("boot failed", r.error);
		return;
	}
	const app = r.value;

	app.render.world.sortableChildren = true;

	// Entity overlay — Graphics on app.render.world, per-tick redraw of the
	// background rect + player + pickups (mirrors arena's entity-render).
	const entity_graphics = new Graphics();
	entity_graphics.label = "lt.entity_graphics";
	entity_graphics.zIndex = 50;
	app.render.world.addChild(entity_graphics);

	game_plugin(app.world, app.schedule, { entity_graphics });

	globalThis.addEventListener("resize", () => {
		app.render.resize(globalThis.innerWidth, globalThis.innerHeight);
	});
	app.start();
};

main();
