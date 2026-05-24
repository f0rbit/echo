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
import { game_plugin } from "./plugin.ts";
import { level_up_pending_r, perk_registry_r, progress_r } from "./resources.ts";
import type { PerkRegistry } from "./data/perks.ts";
import { make_dead_screen_ui } from "./systems/dead-screen-ui.ts";
import { make_hud } from "./systems/hud.ts";
import { make_perk_choice_ui, type UiTextures } from "./systems/perk-choice-ui.ts";
import { load_ui_assets } from "./ui/assets.ts";
import { setup_static } from "./arena-gen.ts";
import { disk_load } from "./disk-save.ts";
import { make_palette_cmds } from "./palette-cmds.ts";
import { make_progress_snapshotter } from "./snapshot.ts";
import { make_auto_save_system } from "./systems/auto-save.ts";
import { make_camera_shake_apply_system } from "./systems/camera-shake.ts";
import { make_swing_arc_system } from "./systems/swing-arc.ts";

// main.ts — Phase 5.4 boot. Adds perk-choice modal overlay + XP/level HUD on
// top of Phase 5.3's entity-render wiring. Mirrors loot/src/main.ts's
// modal-on-app.stage convention (echo AGENTS.md "Game UI overlays —
// app.stage sibling, mirror surface_sprite"). Phase 5.5 adds disk save/load.
//
// Camera follows `visual_pos_c` so cell-step motion looks continuous
// through `tween_step_system` smoothing.

const design = { width: g.cols * g.tile, height: g.rows * g.tile };

const main = async (): Promise<void> => {
	// Pre-boot: prime Pixi's Assets cache with the ui-borders PNGs so the
	// NineSliceSprite-backed perk-choice modal has decoded textures on first
	// render. Option B per src/ui/assets.ts header.
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
		debug: is_dev(),
		app_id: "progress",
	});
	if (!r.ok) {
		console.error("boot failed", r.error);
		return;
	}
	const app = r.value;

	app.render.world.sortableChildren = true;

	// moon_cavern preset — cold bluish ambient with a warm eye-light ring
	// around the player, subtle torch flicker. Matches arena's combat mood
	// (commit bdfa5be) rather than loot's welcoming warm_torch. Eye-follow
	// tracks `visual_pos_c` (cell-step + tween) so the lit ring slides with
	// the smoothed player position rather than snapping cell-to-cell.
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

	// Particles overlay — drawn ABOVE all sprites in the world container.
	// Inside `app.render.world` (filtered by lighting) intentionally — the
	// burst should be subject to the moon_cavern darkness so a kill in a
	// dim spot reads as a punch of light rather than full-brightness sparks.
	const particles_overlay = new Graphics();
	particles_overlay.label = "pr.particles_overlay";
	particles_overlay.zIndex = 100;
	app.render.world.addChild(particles_overlay);

	// Swing-arc overlay — drawn above the player (z=3) but below particles
	// (z=100). Same lighting filter as the rest of the world, so the arc
	// reads brighter where the player's eye-light reaches and dimmer at
	// the edges (intentional — matches the moon_cavern mood).
	const swing_arc_overlay = new Graphics();
	swing_arc_overlay.label = "pr.swing_arc_overlay";
	swing_arc_overlay.zIndex = 4;
	app.render.world.addChild(swing_arc_overlay);

	const { perks_sys, xp_sys } = game_plugin(app.world, app.schedule, { entity_graphics, particles_overlay });

	// Camera shake apply — render-stage, AFTER forge.render so the world
	// has been drawn for the tick before the offset mutates the
	// surface_sprite.position. Mirrors arena's wiring.
	app.schedule.add("render", make_camera_shake_apply_system(app.render), {
		phase: 100,
		name: "pr.camera_shake_apply",
	});

	// Swing arc — render-stage, BEFORE the camera-shake apply so the arc
	// shakes with the world during a kill. Phase 50 places it after
	// forge.render (which uses default phase 0) but before camera_shake's
	// phase 100.
	app.schedule.add("render", make_swing_arc_system(swing_arc_overlay), {
		phase: 50,
		name: "pr.swing_arc",
	});

	app.schedule.add("post", make_eye_follow_system(light, g, visual_pos_c, player_c), { name: "pr.light_eye_follow" });
	app.schedule.add("render", (_w, ctx) => {
		light.update(ctx, () => false);
	}, { phase: 99, name: "pr.light_update" });

	// Phase 5.5 — disk save/load wiring. The snapshotter is the single
	// source of truth for what's serialised (see snapshot.ts). Auto-save
	// runs in `post` so any same-tick state changes (kills, level-ups) are
	// already committed before the diff-check fires.
	const snapper = make_progress_snapshotter();
	app.schedule.add("post", make_auto_save_system({ snapper }), { phase: 80, name: "pr.auto_save" });
	make_palette_cmds({ palette: app.palette, snapper, world: app.world, xp_sys });

	// Player-state accessors — walk the player_c query on each call. Trivial
	// cost (single entity); avoids stale-id traps after restart (mirrors
	// loot/src/main.ts).
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

	// Perk-choice modal — a Container on app.stage (sibling of surface_sprite,
	// below palette_overlay) per echo AGENTS.md. Mirror the surface_sprite
	// scale + offset every resize so design-coord hit-tests from
	// event_to_world line up with the rendered buttons. Apply once at boot
	// AND on every resize callback — NOT per-tick.
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
		// Dead-screen modal mirrors the same viewport transform so its
		// design-coord layout + click hit-test land on screen pixels
		// identically to the perk-choice modal.
		dead_ui.container.scale.set(vp.scale, vp.scale);
		dead_ui.container.position.set(vp.offset.x, vp.offset.y);
	};
	apply_modal_viewport();

	// Dead-screen modal — same app.stage sibling depth as perk-choice
	// (echo AGENTS.md "Game UI overlays — app.stage sibling, mirror
	// surface_sprite"). Visible iff progress_r.dead. The Restart button
	// injects a synthetic `restart` press into the live input layer; the
	// existing `pr.restart` system (which gates on
	// `ctx.input.just("restart")`) handles the rest. R-key restart
	// continues to work unchanged because both keyboard + click feed the
	// same `restart` action.
	const dead_ui = make_dead_screen_ui({
		on_restart: () => app.input.inject_actions([{ kind: "press", action: "restart" }]),
		get_dead,
		get_ui_textures: () => ui_textures,
	});
	app.app.stage.addChildAt(dead_ui.container, palette_idx);

	// Pointerdown → event_to_world → button_at → perks_sys.queue_perk_pick.
	// Teardown stashed for tab-away / unmount cleanliness.
	const canvas = app.canvas();
	let detach_pointer: (() => void) | null = null;
	let detach_dead_pointer: (() => void) | null = null;
	if (canvas) {
		detach_pointer = perk_ui.attach_pointer(canvas, app.camera);
		detach_dead_pointer = dead_ui.attach_pointer(canvas, app.camera);
	}

	// HUD — top-right LV/XP/HP/stats/perks panel on app.render.debug_overlay
	// (unfiltered overlay; canvas-pixel space). The system right-aligns each
	// tick by reading camera viewport.
	const hud = make_hud({ get_stats, get_xp, get_hp, get_perks, get_registry, camera: app.camera });
	app.render.debug_overlay.addChild(hud.container);

	app.schedule.add("render", perk_ui.system, { phase: 90, name: "pr.perk_choice_ui" });
	app.schedule.add("render", dead_ui.system, { phase: 90.5, name: "pr.dead_screen_ui" });
	app.schedule.add("render", hud.system, { phase: 91, name: "pr.hud" });

	globalThis.addEventListener("resize", () => {
		app.render.resize(globalThis.innerWidth, globalThis.innerHeight);
		apply_filter_area();
		apply_modal_viewport();
	});
	globalThis.addEventListener("beforeunload", () => {
		detach_pointer?.();
		detach_dead_pointer?.();
	});

	// Boot tick: fire startup stage (arena-gen seeds resources + spawns
	// player) BEFORE attempting restore. Matches loot's make_restore_target
	// pattern (echo AGENTS.md "Snapshotter.restore() is destructive — boot
	// the target first"). After this, snapper.restore replaces the
	// default-state world with the persisted snapshot if one exists.
	//
	// snapper.restore() calls `world.clear()` which wipes every entity —
	// including the floor + wall entities that are intentionally NOT
	// snapshotted (static config per AGENTS.md). Re-run setup_static after
	// restore to rehydrate them. setup_static is idempotent so this only
	// re-spawns the tiles that restore wiped; the snapshotted player +
	// chasers + their state stay untouched.
	app.tick(1 / 60);
	const loaded = disk_load();
	if (loaded.ok) {
		const restored = snapper.restore(app.world, loaded.value, {
			time: app.time,
			rng: app.rng,
			res: app.res,
		});
		if (restored.ok) {
			setup_static(app.world, app.ctx());
		} else {
			console.warn("[progress] disk restore failed; proceeding with fresh state", restored.error); // non-deterministic-ok: dev diagnostic
		}
	} else if (loaded.error.kind !== "no_save") {
		console.warn("[progress] disk_load:", loaded.error); // non-deterministic-ok: dev diagnostic
	}

	app.start();
};

main();
