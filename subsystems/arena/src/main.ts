import { boot } from "@f0rbit/forge/pixi";
import { pos_c } from "@f0rbit/forge";
import { game_bindings } from "./bindings.ts";
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
		pos: pos_c,
	});
	if (!r.ok) {
		console.error("boot failed", r.error);
		return;
	}
	const app = r.value;
	game_plugin(app.world, app.schedule);
	globalThis.addEventListener("resize", () => {
		app.render.resize(globalThis.innerWidth, globalThis.innerHeight);
	});
	app.start();
};

main();
