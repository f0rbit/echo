import { boot } from "@f0rbit/forge/pixi";
import { presets } from "@f0rbit/forge/presets";
import { game_plugin } from "./plugin.ts";

const main = async (): Promise<void> => {
	const r = await boot({
		mount: "#root",
		window: { width: globalThis.innerWidth, height: globalThis.innerHeight },
		camera: {
			design: { width: 320, height: 180 },
			mode: "extend",
			min: { width: 320, height: 180 },
		},
		bindings: presets.movement2d,
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
