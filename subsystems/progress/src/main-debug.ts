import { boot } from "@f0rbit/forge/pixi";
import type { Id } from "@f0rbit/forge";
import { is_dev } from "@f0rbit/forge/debug";
import { make_eye_follow_system, make_light_system, presets } from "@f0rbit/forge/light";
import { Graphics, Rectangle } from "pixi.js";
import { game_bindings } from "./bindings.ts";
import {
	hp_c,
	perks_c,
	player_c,
	stats_c,
	visual_pos_c,
	xp_c,
	type Hp,
	type Perks,
	type Stats,
	type Xp,
} from "./components.ts";
import { g } from "./grid.ts";
import { debug_plugin } from "./debug-plugin.ts";
import { level_up_pending_r, perk_registry_r, progress_r } from "./resources.ts";
import type { PerkRegistry } from "./data/perks.ts";
import { make_camera_shake_apply_system } from "./systems/camera-shake.ts";
import { make_hud } from "./systems/hud.ts";
import { make_perk_choice_ui, type UiTextures } from "./systems/perk-choice-ui.ts";
import { load_ui_assets } from "./ui/assets.ts";

// main-debug.ts — progress debug fixture boot. Mirrors main.ts shape but
// installs `debug_plugin` (scripted spawns + auto-action driven cycles +
// auto-pick perk_0..2 + mid-fixture disk_save) instead of `game_plugin`.
// Deployed at /echo/progress/debug/ via build:debug.
//
// Unlike main.ts there is NO disk_load on boot — the fixture starts fresh
// every page reload so the auto-action's mid-fixture disk_save is the
// only writer to the slot for the duration of a debug session.

const design = { width: g.cols * g.tile, height: g.rows * g.tile };

const main = async (): Promise<void> => {
	// Pre-boot: prime Pixi's Assets cache with the ui-borders PNGs. Option B
	// per src/ui/assets.ts header (mirrors main.ts).
	const ui_textures: UiTextures = await load_ui_assets();

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
		assets: [
			{ kind: "atlas", alias: "dungeon", url: "dungeon-atlas.json" },
			{ kind: "atlas", alias: "walls", url: "walls-autotile.json" },
		],
		debug: true,
		app_id: "progress-debug",
	});
	if (!r.ok) {
		console.error("boot failed", r.error);
		return;
	}
	const app = r.value;

	app.render.world.sortableChildren = true;

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

	const apply_filter_area = (): void => {
		const vp = app.render.viewport();
		app.render.world.filterArea = new Rectangle(0, 0, vp.view.width, vp.view.height);
	};
	apply_filter_area();
	app.render.world.filters = [light.filter];

	// Background overlay — drawn BELOW all sprites (sprite_c.z=3 for player + chasers).
	const entity_graphics = new Graphics();
	entity_graphics.label = "pr.background_graphics";
	entity_graphics.zIndex = 0;
	app.render.world.addChild(entity_graphics);

	// Particles overlay — mirror main.ts.
	const particles_overlay = new Graphics();
	particles_overlay.label = "pr.particles_overlay";
	particles_overlay.zIndex = 100;
	app.render.world.addChild(particles_overlay);

	const { perks_sys } = debug_plugin(app.world, app.schedule, { entity_graphics, particles_overlay });

	app.schedule.add("render", make_camera_shake_apply_system(app.render), {
		phase: 100,
		name: "pr.debug.camera_shake_apply",
	});

	app.schedule.add("post", make_eye_follow_system(light, g, visual_pos_c, player_c), { name: "pr.debug.light_eye_follow" });
	app.schedule.add("render", (_w, ctx) => {
		light.update(ctx, () => false);
	}, { phase: 99, name: "pr.debug.light_update" });

	const get_player_id = (): Id | null => {
		const players = app.world.query([player_c] as const).collect();
		const first = players[0];
		return first ? first[0] : null;
	};
	const get_xp = (): Xp | null => {
		const id = get_player_id();
		if (id === null) return null;
		const r = app.world.get(id, xp_c);
		return r.ok ? r.value : null;
	};
	const get_hp = (): Hp | null => {
		const id = get_player_id();
		if (id === null) return null;
		const r = app.world.get(id, hp_c);
		return r.ok ? r.value : null;
	};
	const get_stats = (): Stats | null => {
		const id = get_player_id();
		if (id === null) return null;
		const r = app.world.get(id, stats_c);
		return r.ok ? r.value : null;
	};
	const get_perks = (): Perks | null => {
		const id = get_player_id();
		if (id === null) return null;
		const r = app.world.get(id, perks_c);
		return r.ok ? r.value : null;
	};
	const get_registry = (): PerkRegistry | null => {
		const reg = app.res.get(perk_registry_r);
		return reg.ok ? (reg.value as unknown as PerkRegistry) : null;
	};
	const get_dead = (): boolean => {
		const prog = app.res.get(progress_r);
		return prog.ok && prog.value.dead;
	};
	const get_visible = (): boolean => {
		const prog = app.res.get(progress_r);
		const lvl = app.res.get(level_up_pending_r);
		return prog.ok && lvl.ok && prog.value.paused && lvl.value.pending;
	};
	const get_choices = (): readonly string[] => {
		const lvl = app.res.get(level_up_pending_r);
		return lvl.ok ? lvl.value.choices : [];
	};

	const perk_ui = make_perk_choice_ui({
		on_pick: perks_sys.queue_perk_pick,
		get_visible,
		get_choices,
		get_registry,
		get_ui_textures: () => ui_textures,
	});
	const palette_idx = app.app.stage.getChildIndex(app.render.palette_overlay);
	app.app.stage.addChildAt(perk_ui.container, palette_idx);

	const apply_modal_viewport = (): void => {
		const vp = app.camera.viewport();
		perk_ui.container.scale.set(vp.scale, vp.scale);
		perk_ui.container.position.set(vp.offset.x, vp.offset.y);
	};
	apply_modal_viewport();

	const canvas = app.canvas();
	let detach_pointer: (() => void) | null = null;
	if (canvas) detach_pointer = perk_ui.attach_pointer(canvas, app.camera);

	const hud = make_hud({ get_stats, get_xp, get_hp, get_perks, get_registry, get_dead, camera: app.camera });
	app.render.debug_overlay.addChild(hud.container);

	app.schedule.add("render", perk_ui.system, { phase: 90, name: "pr.perk_choice_ui" });
	app.schedule.add("render", hud.system, { phase: 91, name: "pr.hud" });

	globalThis.addEventListener("resize", () => {
		app.render.resize(globalThis.innerWidth, globalThis.innerHeight);
		apply_filter_area();
		apply_modal_viewport();
	});
	globalThis.addEventListener("beforeunload", () => {
		detach_pointer?.();
	});

	app.start();
};

main();
