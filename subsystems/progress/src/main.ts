import { boot } from "@f0rbit/forge/pixi";
import type { Id } from "@f0rbit/forge";
import { Graphics } from "pixi.js";
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
import { make_hud } from "./systems/hud.ts";
import { make_perk_choice_ui } from "./systems/perk-choice-ui.ts";
import { disk_load } from "./disk-save.ts";
import { make_palette_cmds } from "./palette-cmds.ts";
import { make_progress_snapshotter } from "./snapshot.ts";
import { make_auto_save_system } from "./systems/auto-save.ts";

// main.ts — Phase 5.4 boot. Adds perk-choice modal overlay + XP/level HUD on
// top of Phase 5.3's entity-render wiring. Mirrors loot/src/main.ts's
// modal-on-app.stage convention (echo AGENTS.md "Game UI overlays —
// app.stage sibling, mirror surface_sprite"). Phase 5.5 adds disk save/load.
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

	const { perks_sys, xp_sys } = game_plugin(app.world, app.schedule, { entity_graphics });

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
	});
	const palette_idx = app.app.stage.getChildIndex(app.render.palette_overlay);
	app.app.stage.addChildAt(perk_ui.container, palette_idx);

	const apply_modal_viewport = (): void => {
		const vp = app.camera.viewport();
		perk_ui.container.scale.set(vp.scale, vp.scale);
		perk_ui.container.position.set(vp.offset.x, vp.offset.y);
	};
	apply_modal_viewport();

	// Pointerdown → event_to_world → button_at → perks_sys.queue_perk_pick.
	// Teardown stashed for tab-away / unmount cleanliness.
	const canvas = app.canvas();
	let detach_pointer: (() => void) | null = null;
	if (canvas) detach_pointer = perk_ui.attach_pointer(canvas, app.camera);

	// HUD — top-right LV/XP/HP/stats/perks panel on app.render.debug_overlay
	// (unfiltered overlay; canvas-pixel space). The system right-aligns each
	// tick by reading camera viewport.
	const hud = make_hud({ get_stats, get_xp, get_hp, get_perks, get_registry, camera: app.camera });
	app.render.debug_overlay.addChild(hud.container);

	app.schedule.add("render", perk_ui.system, { phase: 90, name: "pr.perk_choice_ui" });
	app.schedule.add("render", hud.system, { phase: 91, name: "pr.hud" });

	globalThis.addEventListener("resize", () => {
		app.render.resize(globalThis.innerWidth, globalThis.innerHeight);
		apply_modal_viewport();
	});
	globalThis.addEventListener("beforeunload", () => {
		detach_pointer?.();
	});

	// Boot tick: fire startup stage (arena-gen seeds resources + spawns
	// player) BEFORE attempting restore. Matches loot's make_restore_target
	// pattern (echo AGENTS.md "Snapshotter.restore() is destructive — boot
	// the target first"). After this, snapper.restore replaces the
	// default-state world with the persisted snapshot if one exists.
	app.tick(1 / 60);
	const loaded = disk_load();
	if (loaded.ok) {
		const restored = snapper.restore(app.world, loaded.value, {
			time: app.time,
			rng: app.rng,
			res: app.res,
		});
		if (!restored.ok) {
			console.warn("[progress] disk restore failed; proceeding with fresh state", restored.error); // non-deterministic-ok: dev diagnostic
		}
	} else if (loaded.error.kind !== "no_save") {
		console.warn("[progress] disk_load:", loaded.error); // non-deterministic-ok: dev diagnostic
	}

	app.start();
};

main();
