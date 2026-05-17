import { boot } from "@f0rbit/forge/pixi";
import { Graphics } from "pixi.js";
import { game_bindings } from "./bindings.ts";
import { visual_pos_c } from "./components.ts";
import { g } from "./grid.ts";
import { game_plugin } from "./plugin.ts";

// main.ts — Phase 5.3 boot. Wires the entity-render Graphics + plugin.
// NO inventory UI / stat HUD yet — Phase 5.4 adds those + Phase 5.5
// adds disk save/load.
//
// Camera follows `visual_pos_c` so cell-step motion looks continuous
// through `tween_step_system` smoothing.

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

	// Returned handles (`xp_sys`, `perks_sys`) are consumed by Phase 5.4 UI
	// wiring (DOM pointerdown → perks_sys.queue_perk_pick). Discarded here.
	game_plugin(app.world, app.schedule, { entity_graphics });

	globalThis.addEventListener("resize", () => {
		app.render.resize(globalThis.innerWidth, globalThis.innerHeight);
	});
	app.start();
};

main();
