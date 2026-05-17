import { pos_c, type Ctx, type Id, type System, type World } from "@f0rbit/forge";
import { inventory_c, pickup_c, player_c } from "../components.ts";
import { inventory_ui_r, item_registry_r } from "../resources.ts";
import { g } from "../grid.ts";
import { equip_item } from "./equipment.ts";
import type { ItemDef, ItemId } from "../data/items.ts";

// inventory.ts — slot management + click consumption.
//
// Click signal:
//   The real DOM pointer-down handler lives on the inventory UI overlay
//   (Phase 4.4). For Phase 4.2 we expose a closure-local queue via the
//   returned system's companion helpers: `queue_click(idx)` lets tests (and
//   Phase 4.4's pointerdown listener) enqueue a click without touching the
//   resource shape. The system drains the queue every `update` tick.
//
//   Closure-local — not a resource — because the queue is transient state
//   that must NOT participate in snapshot/replay (per .plans/loot.md §2 Q9).
//
// Click semantics (per .plans/loot.md §2 Q9):
//   - empty slot → no-op
//   - weapon / offhand / ring → toggle equip (see equipment.ts ring policy)
//   - potion → drop back to floor at player cell (4-neighbour fallback;
//     console.warn + no-op if no cell is open)

export type InventorySystem = {
	system: System;
	queue_click: (slot_idx: number) => void;
};

const find_player = (w: World): Id | null => {
	const players = w.query([player_c, pos_c] as const).collect();
	const first = players[0];
	if (!first) return null;
	return first[0];
};

const lookup_def = (ctx: Ctx, item_id: string): ItemDef | null => {
	const reg = ctx.res.get(item_registry_r);
	if (!reg.ok) return null;
	return (reg.value.items.get(item_id as ItemId) ?? null) as ItemDef | null;
};

const cell_occupied_by_pickup = (w: World, cx: number, cy: number): boolean => {
	for (const [, pos] of w.query([pos_c, pickup_c] as const).collect()) {
		const c = g.world_to_cell(pos.x, pos.y);
		if (c.x === cx && c.y === cy) return true;
	}
	return false;
};

const find_drop_cell = (w: World, origin_cx: number, origin_cy: number): { x: number; y: number } | null => {
	if (!cell_occupied_by_pickup(w, origin_cx, origin_cy) && g.in_bounds(origin_cx, origin_cy)) {
		return { x: origin_cx, y: origin_cy };
	}
	for (const n of g.neighbors4(origin_cx, origin_cy)) {
		if (!g.in_bounds(n.x, n.y)) continue;
		if (cell_occupied_by_pickup(w, n.x, n.y)) continue;
		return { x: n.x, y: n.y };
	}
	return null;
};

const drop_potion = (w: World, ctx: Ctx, player_id: Id, slot_idx: number, item_id: string): void => {
	const player_pos = w.get(player_id, pos_c);
	if (!player_pos.ok) return;
	const cell = g.world_to_cell(player_pos.value.x, player_pos.value.y);
	const drop_cell = find_drop_cell(w, cell.x, cell.y);
	if (!drop_cell) {
		console.warn(`[loot] cannot drop potion ${item_id}: no open cell adjacent to (${cell.x},${cell.y})`);
		return;
	}
	const world_pos = g.cell_to_world(drop_cell.x, drop_cell.y);
	w.spawn([pos_c, world_pos], [pickup_c, { item_id }]);

	const inv = w.get(player_id, inventory_c);
	if (!inv.ok) return;
	const next_slots = inv.value.slots.slice();
	next_slots[slot_idx] = null;
	w.set(player_id, inventory_c, { slots: next_slots });
	void ctx;
};

const handle_click = (w: World, ctx: Ctx, player_id: Id, slot_idx: number): void => {
	const inv = w.get(player_id, inventory_c);
	if (!inv.ok) return;
	if (slot_idx < 0 || slot_idx >= inv.value.slots.length) return;
	const item_id = inv.value.slots[slot_idx] ?? null;
	if (item_id === null) return;

	const def = lookup_def(ctx, item_id);
	if (!def) return;

	if (def.kind === "potion") {
		drop_potion(w, ctx, player_id, slot_idx, item_id);
		return;
	}
	equip_item(w, player_id, ctx, slot_idx, item_id);
};

// Adds `item_id` to the first empty inventory slot on the player. Returns
// `true` on success, `false` if the inventory is full or the player has no
// inventory component.
export const try_add_item = (w: World, player_id: Id, _ctx: Ctx, item_id: string): boolean => {
	const inv = w.get(player_id, inventory_c);
	if (!inv.ok) return false;
	const empty_idx = inv.value.slots.findIndex((s) => s === null);
	if (empty_idx === -1) return false;
	const next_slots = inv.value.slots.slice();
	next_slots[empty_idx] = item_id;
	w.set(player_id, inventory_c, { slots: next_slots });
	return true;
};

export const make_inventory_system = (): InventorySystem => {
	let pending: number[] = [];

	const system: System = (w, ctx) => {
		if (pending.length === 0) return;
		const drained = pending;
		pending = [];
		const player_id = find_player(w);
		if (player_id === null) return;
		for (const slot_idx of drained) {
			handle_click(w, ctx, player_id, slot_idx);
		}
	};

	const queue_click = (slot_idx: number): void => {
		pending.push(slot_idx);
	};

	return { system, queue_click };
};
