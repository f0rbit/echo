import type { Ctx, Schedule, System, World } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import {
	dir_c,
	equipment_c,
	inventory_c,
	pickup_c,
	player_c,
	stats_c,
	visual_pos_c,
	type Equipment,
} from "./components.ts";
import { g } from "./grid.ts";
import { arena_r, inventory_ui_r, item_registry_r, run_seed_r } from "./resources.ts";
import { make_inventory_system, type InventorySystem } from "./systems/inventory.ts";
import { movement_system, step_every } from "./systems/movement.ts";
import { make_pickups_system } from "./systems/pickups.ts";
import { sprite_attach_system } from "./systems/sprite-attach.ts";
import { make_stats_recompute_system } from "./systems/stats.ts";
import { BASE_STATS } from "./systems/stats.ts";
import { tween_step_system } from "./systems/tween.ts";
import { make_item_registry, type ItemId } from "./data/items.ts";

// debug-plugin.ts — stripped loot scene for visual fixture verification.
//
// Differences from `game_plugin`:
//   - No `restart` system (page reload resets the demo).
//   - No `input` system — `debug_auto_action` writes dir_c directly.
//   - No `synthetic_slot_click` — `debug_auto_action` calls `queue_click`
//     directly. The synthetic-binding edge is for replay determinism; the
//     debug fixture doesn't need to be replayable.
//   - Hand-crafted arena: player at (2,5), 6 pickups in a row at x=4..9.
//
// Auto-action schedule (per .plans/loot.md §5 Phase 4.6):
//   ticks 0..119  → walk right (dir_c = { dx: 1, dy: 0 })
//   tick 120      → stop moving
//   tick 130      → open inventory (toggle inventory_ui_r.open)
//   tick 200      → queue click on slot 0 (sword)
//   tick 240      → queue click on slot 2 (ring_of_haste)
//   tick 300      → queue click on slot 3 (ring_of_vigor)
//   tick 360+     → idle; HUD shows final stats.

export type DebugPluginOpts = {
	inventory_system?: InventorySystem;
};

const INVENTORY_SLOTS = 12;
const empty_equipment: Equipment = { weapon: null, offhand: null, ring1: null, ring2: null };

// Pickup layout — index matches the order pickups are collected (left→right),
// which is also the inventory-slot index they land in after walk-right.
const PICKUP_LAYOUT: ReadonlyArray<{ x: number; y: number; id: string }> = [
	{ x: 4, y: 5, id: "item.sword_of_fire" },
	{ x: 5, y: 5, id: "item.staff_warding" },
	{ x: 6, y: 5, id: "item.ring_of_haste" },
	{ x: 7, y: 5, id: "item.ring_of_vigor" },
	{ x: 8, y: 5, id: "item.potion_of_healing" },
	{ x: 9, y: 5, id: "item.potion_of_might" },
];

const PLAYER_SPAWN = { x: 2, y: 5 };

const debug_setup_arena = (w: World, ctx: Ctx): void => {
	ctx.res.set(arena_r, {
		cols: g.cols,
		rows: g.rows,
		width: g.cols * g.tile,
		height: g.rows * g.tile,
	});
	ctx.res.set(run_seed_r, { base: ctx.rng.seed, restart_count: 0 });
	ctx.res.set(inventory_ui_r, { open: false, selected_slot: null, dirty_stats: false });
	const reg = make_item_registry();
	ctx.res.set(item_registry_r, { items: reg.items as unknown as Map<string, unknown> });

	const wp = g.cell_to_world(PLAYER_SPAWN.x, PLAYER_SPAWN.y);
	w.spawn(
		[player_c, true],
		[pos_c, wp],
		[visual_pos_c, { ...wp }],
		[dir_c, { dx: 0, dy: 0 }],
		[inventory_c, { slots: Array(INVENTORY_SLOTS).fill(null) as (string | null)[] }],
		[equipment_c, { ...empty_equipment }],
		[stats_c, { ...BASE_STATS }],
	);

	for (const p of PICKUP_LAYOUT) {
		const pwp = g.cell_to_world(p.x, p.y);
		w.spawn(
			[pos_c, pwp],
			[visual_pos_c, { ...pwp }],
			[pickup_c, { item_id: p.id as ItemId }],
		);
	}
};

const make_debug_auto_action_system = (queue_click: (idx: number) => void): System => (w, ctx) => {
	const tick = ctx.time.tick;

	// Movement phase — set dir_c on the player. After tick 120 stop moving.
	const dx: -1 | 0 | 1 = tick < 120 ? 1 : 0;
	for (const [id] of w.query([player_c, dir_c] as const)) {
		w.set(id, dir_c, { dx, dy: 0 });
	}

	// Single-tick edges for inventory + click actions.
	if (tick === 130) {
		const ui = ctx.res.get(inventory_ui_r);
		if (ui.ok) ctx.res.set(inventory_ui_r, { ...ui.value, open: true });
	}
	if (tick === 200) queue_click(0);
	if (tick === 240) queue_click(2);
	if (tick === 300) queue_click(3);
};

export const debug_plugin = (_w: World, sch: Schedule, opts: DebugPluginOpts = {}): InventorySystem => {
	const inv = opts.inventory_system ?? make_inventory_system();

	sch.add("startup", (w, ctx) => debug_setup_arena(w, ctx), "lt.debug.setup");

	sch.add("update", make_debug_auto_action_system(inv.queue_click), { phase: 0, name: "lt.debug_auto_action" });
	sch.add("update", movement_system, { every: step_every, phase: 1, name: "lt.movement" });
	sch.add("update", make_pickups_system(), { phase: 2, name: "lt.pickups" });
	sch.add("update", inv.system, { phase: 3, name: "lt.inventory" });
	sch.add("update", make_stats_recompute_system(), { phase: 4, name: "lt.stats_recompute" });

	sch.add("post", sprite_attach_system, { phase: 0, name: "lt.sprite_attach" });
	sch.add("post", tween_step_system, { phase: 1, name: "lt.tween" });

	return inv;
};
