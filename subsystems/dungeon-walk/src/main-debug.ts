import { boot } from "@f0rbit/forge/pixi";
import { is_dev } from "@f0rbit/forge/debug";
import { game_bindings } from "./bindings.ts";
import { visual_pos_c } from "./components.ts";
import { debug_plugin } from "./debug-plugin.ts";

const design = { width: 320, height: 176 };

const main = async (): Promise<void> => {
	const r = await boot({
		mount: "#root",
		window: { width: globalThis.innerWidth, height: globalThis.innerHeight },
		camera: {
			design,
			mode: "extend",
			min: design,
		},
		bindings: game_bindings,
		pos: visual_pos_c,
		assets: [
			{ kind: "atlas", alias: "dungeon", url: "dungeon-atlas.json" },
			{ kind: "atlas", alias: "walls", url: "walls-autotile.json" },
		],
		debug: true,
		app_id: "dungeon-walk-debug",
	});
	if (!r.ok) {
		console.error("boot failed", r.error);
		return;
	}
	const app = r.value;
	app.render.world.sortableChildren = true;
	debug_plugin(app.world, app.schedule, {
		world_container: app.render.world,
		debug_container: app.render.debug_overlay ?? app.app.stage,
		camera: app.camera,
	});
	globalThis.addEventListener("resize", () => {
		app.render.resize(globalThis.innerWidth, globalThis.innerHeight);
	});
	app.start();
	setTimeout(() => {
		(globalThis as unknown as { echoWallDebug?: (on?: boolean) => boolean }).echoWallDebug?.(true);
		(globalThis as unknown as { echoWallClick?: (on?: boolean) => boolean }).echoWallClick?.(true);
	}, 100);
};

main();
