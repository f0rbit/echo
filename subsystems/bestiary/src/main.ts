import { boot } from "@f0rbit/forge/pixi";
import { game_bindings } from "./bindings.ts";
import { g } from "./grid.ts";
import { game_plugin } from "./plugin.ts";
import { make_telegraph_render } from "./systems/telegraph-render.ts";

const main = async (): Promise<void> => {
	const r = await boot({
		mount: "#root",
		window: { width: globalThis.innerWidth, height: globalThis.innerHeight },
		camera: {
			design: { width: 480, height: 320 },
			mode: "extend",
			min: { width: 480, height: 320 },
			pixel_perfect: true,
		},
		bindings: game_bindings,
	});
	if (!r.ok) {
		console.error("boot failed", r.error);
		return;
	}
	const app = r.value;
	const telegraph_render = make_telegraph_render(app.render.world, g);
	game_plugin(app.world, app.schedule, { telegraph_render });
	globalThis.addEventListener("resize", () => {
		app.render.resize(globalThis.innerWidth, globalThis.innerHeight);
	});
	app.start();
};

main();
