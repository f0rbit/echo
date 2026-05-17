// Phase 4.0 stub for the debug fixture entry. Real debug-plugin wiring lands
// in the loot debug-fixture phase. Keeping this minimal so `build:debug`
// works pre-debug-page-implementation and the build-time `main-debug.js →
// main.js` rename trick stays exercised (see AGENTS.md "Debug build pipeline
// rename").
import { boot } from "@f0rbit/forge/pixi";
import { pos_c } from "@f0rbit/forge";
import { game_bindings } from "./bindings.ts";
import { g } from "./grid.ts";

const design = { width: g.cols * g.tile, height: g.rows * g.tile };

const main = async (): Promise<void> => {
	console.log("loot debug fixture — Phase 4.0 placeholder");
	const r = await boot({
		mount: "#root",
		window: { width: globalThis.innerWidth, height: globalThis.innerHeight },
		camera: { design, mode: "extend", min: design, pixel_perfect: true },
		bindings: game_bindings,
		pos: pos_c,
	});
	if (!r.ok) {
		console.error("boot failed", r.error);
		return;
	}
	r.value.start();
};

main();
