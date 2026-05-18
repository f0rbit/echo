import { boot } from "@f0rbit/forge/pixi";
import type { Id } from "@f0rbit/forge";
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
import { debug_plugin } from "./debug-plugin.ts";
import { inventory_ui_r, item_registry_r } from "./resources.ts";
import type { ItemRegistry } from "./data/items.ts";
import { make_inventory_ui } from "./systems/inventory-ui.ts";
import { make_stat_panel_hud } from "./systems/stat-panel-hud.ts";

// main-debug.ts — loot debug fixture boot. Mirrors main.ts shape but installs
// `debug_plugin` (auto-action driven, hand-crafted arena) instead of
// `game_plugin`. Deployed at /echo/loot/debug/ via build:debug.
//
// The DOM pointer handler is wired the same way as main.ts so a curious user
// can still click slots manually — the auto-action just races ahead first.

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
		assets: [
			{ kind: "atlas", alias: "dungeon", url: "dungeon-atlas.json" },
		],
	});
	if (!r.ok) {
		console.error("boot failed", r.error);
		return;
	}
	const app = r.value;

	app.render.world.sortableChildren = true;

	const inv_sys = debug_plugin(app.world, app.schedule);

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

	const inventory_ui = make_inventory_ui({
		on_slot_click: inv_sys.queue_click,
		get_inventory,
		get_equipment,
		get_registry,
		get_open,
		get_selected,
		assets: app.assets,
	});
	const palette_idx = app.app.stage.getChildIndex(app.render.palette_overlay);
	app.app.stage.addChildAt(inventory_ui.container, palette_idx);

	const apply_modal_viewport = (): void => {
		const vp = app.camera.viewport();
		inventory_ui.container.scale.set(vp.scale, vp.scale);
		inventory_ui.container.position.set(vp.offset.x, vp.offset.y);
	};
	apply_modal_viewport();

	const canvas = app.canvas();
	let detach_pointer: (() => void) | null = null;
	if (canvas) detach_pointer = inventory_ui.attach_pointer(canvas, app.camera);

	const stat_hud = make_stat_panel_hud({ get_stats, camera: app.camera });
	app.render.debug_overlay.addChild(stat_hud.container);

	app.schedule.add("render", inventory_ui.system, { phase: 90, name: "lt.inventory_ui" });
	app.schedule.add("render", stat_hud.system, { phase: 91, name: "lt.stat_panel_hud" });

	globalThis.addEventListener("resize", () => {
		app.render.resize(globalThis.innerWidth, globalThis.innerHeight);
		apply_modal_viewport();
	});
	globalThis.addEventListener("beforeunload", () => {
		detach_pointer?.();
	});
	app.start();
};

main();
