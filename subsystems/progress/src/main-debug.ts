import { boot } from "@f0rbit/forge/pixi";
import { Graphics } from "pixi.js";
import { game_bindings } from "./bindings.ts";
import { visual_pos_c } from "./components.ts";
import { g } from "./grid.ts";
import { game_plugin } from "./plugin.ts";

// main-debug.ts — Phase 5.0 placeholder. Phase 5.7 replaces with a real
// debug fixture (stripped plugin + scripted spawns + auto-swing + auto-pick).
// Until then this mirrors main.ts so build:debug succeeds.

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

	app.render.world.sortableChildren = true;

	const entity_graphics = new Graphics();
	entity_graphics.label = "pr.entity_graphics";
	entity_graphics.zIndex = 50;
	app.render.world.addChild(entity_graphics);

	game_plugin(app.world, app.schedule, {});

	globalThis.addEventListener("resize", () => {
		app.render.resize(globalThis.innerWidth, globalThis.innerHeight);
	});
	app.start();
};

main();
