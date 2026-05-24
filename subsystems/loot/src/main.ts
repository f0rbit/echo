import { boot } from "@f0rbit/forge/pixi";
import type { Id } from "@f0rbit/forge";
import { is_dev } from "@f0rbit/forge/debug";
import { make_eye_follow_system, make_light_system, presets } from "@f0rbit/forge/light";
import { Rectangle } from "pixi.js";
import { game_bindings } from "./bindings.ts";
import {
	equipment_c,
	inventory_c,
	player_c,
	stats_c,
	visual_pos_c,
	type Equipment,
	type Inventory,
	type Stats,
} from "./components.ts";
import { g } from "./grid.ts";
import { game_plugin } from "./plugin.ts";
import { inventory_ui_r, item_registry_r } from "./resources.ts";
import type { ItemRegistry } from "./data/items.ts";
import { make_inventory_ui } from "./systems/inventory-ui.ts";
import { make_stat_panel_hud } from "./systems/stat-panel-hud.ts";

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
		// Camera follows the smoothed visual position; sprite_sync_system reads
		// the same component so the player + pickups tween through cell steps
		// instead of jumping (mirrors bestiary's main.ts).
		pos: visual_pos_c,
		assets: [
			{ kind: "atlas", alias: "dungeon", url: "dungeon-atlas.json" },
			{ kind: "atlas", alias: "walls", url: "walls-autotile.json" },
		],
		debug: is_dev(),
		app_id: "loot",
	});
	if (!r.ok) {
		console.error("boot failed", r.error);
		return;
	}
	const app = r.value;

	app.render.world.sortableChildren = true;

	// warm_torch preset — welcoming yellow-orange eye-light against a dim
	// near-black ambient. Eye-follow tracks `visual_pos_c` (cell-step +
	// tween) so the lit ring slides with the smoothed player position
	// rather than snapping cell-to-cell. Mirrors arena's polish (commit
	// bdfa5be) with warm_torch instead of moon_cavern.
	const light = make_light_system({
		grid: g,
		ambient: presets.warm_torch.ambient,
		eye: {
			color: presets.warm_torch.default_torch_color,
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

	const inv_sys = game_plugin(app.world, app.schedule);

	app.schedule.add("post", make_eye_follow_system(light, g, visual_pos_c, player_c), { name: "lt.light_eye_follow" });
	app.schedule.add("render", (_w, ctx) => {
		light.update(ctx, () => false);
	}, { phase: 99, name: "lt.light_update" });

	// Closures over app.world — read the player's inventory_c / equipment_c
	// per redraw. find_player walks the player_c query each call; trivial cost
	// (single entity) and avoids stale-id traps after restart.
	const get_player_id = (): Id | null => {
		const players = app.world.query([player_c] as const).collect();
		const first = players[0];
		return first ? first[0] : null;
	};
	const get_inventory = (): Inventory | null => {
		const id = get_player_id();
		if (id === null) return null;
		const r = app.world.get(id, inventory_c);
		return r.ok ? r.value : null;
	};
	const get_equipment = (): Equipment | null => {
		const id = get_player_id();
		if (id === null) return null;
		const r = app.world.get(id, equipment_c);
		return r.ok ? r.value : null;
	};
	const get_stats = (): Stats | null => {
		const id = get_player_id();
		if (id === null) return null;
		const r = app.world.get(id, stats_c);
		return r.ok ? r.value : null;
	};
	const get_registry = (): ItemRegistry | null => {
		const reg = app.res.get(item_registry_r);
		return reg.ok ? (reg.value as unknown as ItemRegistry) : null;
	};
	const get_open = (): boolean => {
		const ui = app.res.get(inventory_ui_r);
		return ui.ok ? ui.value.open : false;
	};
	const get_selected = (): number | null => {
		const ui = app.res.get(inventory_ui_r);
		return ui.ok ? ui.value.selected_slot : null;
	};

	// Inventory UI — a Container on app.stage (sibling of surface_sprite,
	// below palette_overlay) per .plans/loot.md §2 Q4. We mirror the
	// surface_sprite scale + offset every resize so design-coord hit-tests
	// from event_to_world line up with the rendered slots.
	const inventory_ui = make_inventory_ui({
		on_slot_click: inv_sys.queue_click,
		get_inventory,
		get_equipment,
		get_registry,
		get_open,
		get_selected,
		assets: app.assets,
	});
	// Z-stack: surface_sprite (idx 0) → debug_overlay (idx 1) →
	// inventory_ui_container (idx 2) → palette_overlay (idx 3). addChild
	// inserts at top; palette_overlay was added last by forge so it's already
	// on top. Use addChildAt before palette_overlay's index.
	const palette_idx = app.app.stage.getChildIndex(app.render.palette_overlay);
	app.app.stage.addChildAt(inventory_ui.container, palette_idx);

	const apply_modal_viewport = (): void => {
		const vp = app.camera.viewport();
		inventory_ui.container.scale.set(vp.scale, vp.scale);
		inventory_ui.container.position.set(vp.offset.x, vp.offset.y);
	};
	apply_modal_viewport();

	// Pointerdown → event_to_world → slot_at → inv_sys.queue_click. Teardown
	// stashed for tab-away / unmount cleanliness.
	const canvas = app.canvas();
	let detach_pointer: (() => void) | null = null;
	if (canvas) detach_pointer = inventory_ui.attach_pointer(canvas, app.camera);

	// Stat panel HUD — top-right Text on app.render.debug_overlay (unfiltered
	// overlay; canvas-pixel space). The system right-aligns each tick.
	const stat_hud = make_stat_panel_hud({ get_stats, camera: app.camera });
	app.render.debug_overlay.addChild(stat_hud.container);

	app.schedule.add("render", inventory_ui.system, { phase: 90, name: "lt.inventory_ui" });
	app.schedule.add("render", stat_hud.system, { phase: 91, name: "lt.stat_panel_hud" });

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
