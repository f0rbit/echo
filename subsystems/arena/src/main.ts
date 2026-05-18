import { boot } from "@f0rbit/forge/pixi";
import { pos_c } from "@f0rbit/forge";
import { make_light_system, presets } from "@f0rbit/forge/light";
import { Graphics, Rectangle } from "pixi.js";
import { game_bindings } from "./bindings.ts";
import { g } from "./grid.ts";
import { game_plugin } from "./plugin.ts";
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
	});
	if (!r.ok) {
		console.error("boot failed", r.error);
		return;
	}
	const app = r.value;

	// Moody moon_cavern preset — bluish ambient + warm eye-light ring around
	// the player with subtle torch flicker. Screen-flash + hit-glow lights from
	// light_fx_system still add color on top.
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

	// Swing overlay — drawn ABOVE sprites so the melee arc visually flashes
	// over the player. zIndex 50 sits between sprites (≤4) and particles (100).
	// Floor sprites (sprite_c.z=1) replace the old background rect.
	const swing_graphics = new Graphics();
	swing_graphics.label = "ar.swing_graphics";
	swing_graphics.zIndex = 50;
	app.render.world.addChild(swing_graphics);

	// Particle overlay — a Graphics in `app.render.world` so it composites with
	// the same lighting filter as game sprites. zIndex 100 → above swing.
	const particles_overlay = new Graphics();
	particles_overlay.label = "ar.particles_overlay";
	particles_overlay.zIndex = 100;
	app.render.world.addChild(particles_overlay);

	game_plugin(app.world, app.schedule, { light, particles_overlay });

	app.schedule.add("render", make_entity_render_system({ swing: swing_graphics }), {
		phase: 10,
		name: "ar.entity_render",
	});

	// Camera shake — render stage AFTER `forge.render`. Uses v0.4.3's
	// `render.set_screen_offset` so the offset survives resize.
	app.schedule.add("render", make_camera_shake_apply_system(app.render), {
		phase: 100,
		name: "ar.camera_shake_apply",
	});

	// Light grid update — pure overlay lights; no FOV blockers.
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
