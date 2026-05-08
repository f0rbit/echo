import { boot } from "@f0rbit/forge/pixi";
import { game_bindings } from "./bindings.ts";
import { game_plugin } from "./plugin.ts";

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
	game_plugin(app.world, app.schedule);
	globalThis.addEventListener("resize", () => {
		app.render.resize(globalThis.innerWidth, globalThis.innerHeight);
	});
	app.start();
};

main();
