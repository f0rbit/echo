import { boot } from "@f0rbit/forge/pixi";
import { pos_c } from "@f0rbit/forge";
import { is_dev } from "@f0rbit/forge/debug";
import { make_light_system, presets } from "@f0rbit/forge/light";
import { Graphics, Rectangle } from "pixi.js";
import { game_bindings } from "./bindings.ts";
import { debug_plugin } from "./debug-plugin.ts";
import { g } from "./grid.ts";
import { make_camera_shake_apply_system } from "./systems/camera-shake.ts";
import { make_entity_render_system } from "./systems/entity-render.ts";

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
		assets: [
			{ kind: "atlas", alias: "dungeon", url: "dungeon-atlas.json" },
			{ kind: "atlas", alias: "walls", url: "walls-autotile.json" },
		],
		debug: true,
		app_id: "arena-debug",
	});
	if (!r.ok) {
		console.error("boot failed", r.error);
		return;
	}
	const app = r.value;

	const light = make_light_system({
		grid: g,
		ambient: presets.moon_cavern.ambient,
		eye: {
			color: presets.moon_cavern.default_torch_color,
			radius_cells: 6,
			intensity: 0.95,
			falloff: 2.5,
			flicker: { kind: "torch", amount: 0.12, seed: 1 },
		},
	});

	app.render.world.sortableChildren = true;
	const apply_filter_area = (): void => {
		const vp = app.render.viewport();
		app.render.world.filterArea = new Rectangle(0, 0, vp.view.width, vp.view.height);
	};
	apply_filter_area();
	app.render.world.filters = [light.filter];

	const swing_graphics = new Graphics();
	swing_graphics.label = "ar.swing_graphics";
	swing_graphics.zIndex = 50;
	app.render.world.addChild(swing_graphics);

	const particles_overlay = new Graphics();
	particles_overlay.label = "ar.particles_overlay";
	particles_overlay.zIndex = 100;
	app.render.world.addChild(particles_overlay);

	const debug_container = app.render.debug_overlay ?? app.app.stage;

	debug_plugin(app.world, app.schedule, {
		light,
		particles_overlay,
		debug_container,
	});

	app.schedule.add("render", make_entity_render_system({ swing: swing_graphics }), {
		phase: 10,
		name: "ar.entity_render",
	});

	app.schedule.add("render", make_camera_shake_apply_system(app.render), {
		phase: 100,
		name: "ar.camera_shake_apply",
	});

	app.schedule.add("render", (_w, ctx) => {
		light.update(ctx, () => false);
	}, { phase: 99, name: "ar.light_update" });

	globalThis.addEventListener("resize", () => {
		app.render.resize(globalThis.innerWidth, globalThis.innerHeight);
		apply_filter_area();
	});
	app.start();
};

main();
