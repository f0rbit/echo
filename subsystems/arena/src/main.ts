import { boot } from "@f0rbit/forge/pixi";
import { pos_c } from "@f0rbit/forge";
import { make_light_system, presets } from "@f0rbit/forge/light";
import { Graphics, Rectangle } from "pixi.js";
import { game_bindings } from "./bindings.ts";
import { fsm } from "./fsm.ts";
import { g } from "./grid.ts";
import { game_plugin } from "./plugin.ts";
import { game_state_r } from "./resources.ts";
import { make_camera_shake_apply_system } from "./systems/camera-shake.ts";
import { make_entity_render_system } from "./systems/entity-render.ts";
import { make_lost_screen } from "./systems/lost-screen.ts";
import { make_menu_screen } from "./systems/menu-screen.ts";
import { make_win_screen } from "./systems/win-screen.ts";

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

	// Seed game_state_r BEFORE the first tick so the game-state system reads
	// "menu" and DOES NOT call enter-playing on tick 0. The pre-stage system
	// runs every tick and owns spawn-on-enter-playing — main.ts must NOT call
	// setup_arena directly anymore.
	app.res.set(game_state_r, fsm<"menu" | "playing" | "won" | "lost">("menu", 0));

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

	game_plugin(app.world, app.schedule, { light, particles_overlay });

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

	// Game-shell overlays — siblings of surface_sprite on app.stage, inserted
	// BELOW palette_overlay via addChildAt(palette_idx). Order in stage:
	//   surface_sprite (0) -> debug_overlay (1) -> menu (2) -> win (3) ->
	//   lost (4) -> palette_overlay (top). Mutual exclusion is by visible
	//   toggle in each screen's system. They mirror the camera viewport so
	//   design-space layout works.
	const menu_screen = make_menu_screen();
	const win_screen = make_win_screen();
	const lost_screen = make_lost_screen();
	const palette_idx_0 = app.app.stage.getChildIndex(app.render.palette_overlay);
	app.app.stage.addChildAt(menu_screen.container, palette_idx_0);
	const palette_idx_1 = app.app.stage.getChildIndex(app.render.palette_overlay);
	app.app.stage.addChildAt(win_screen.container, palette_idx_1);
	const palette_idx_2 = app.app.stage.getChildIndex(app.render.palette_overlay);
	app.app.stage.addChildAt(lost_screen.container, palette_idx_2);

	const apply_overlay_viewport = (): void => {
		const vp = app.camera.viewport();
		for (const c of [menu_screen.container, win_screen.container, lost_screen.container]) {
			c.scale.set(vp.scale, vp.scale);
			c.position.set(vp.offset.x, vp.offset.y);
		}
	};
	apply_overlay_viewport();

	app.schedule.add("render", menu_screen.system, { phase: 95, name: "ar.menu_screen" });
	app.schedule.add("render", win_screen.system, { phase: 96, name: "ar.win_screen" });
	app.schedule.add("render", lost_screen.system, { phase: 97, name: "ar.lost_screen" });

	globalThis.addEventListener("resize", () => {
		app.render.resize(globalThis.innerWidth, globalThis.innerHeight);
		apply_filter_area();
		apply_overlay_viewport();
	});
	app.start();
};

main();
