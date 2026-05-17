import type { Ctx, System, World, Id } from "@f0rbit/forge";
import { equipment_c, inventory_c, type Equipment, type Inventory } from "../components.ts";
import { inventory_ui_r, item_registry_r } from "../resources.ts";
import type { ItemDef, ItemId } from "../data/items.ts";

// equipment.ts — equip / unequip helpers.
//
// No per-tick system in v1: equip ops fire from inventory.ts's click handler.
// `make_equipment_system` is exported for forward-compat (Phase 4.4 may add
// hover-highlight logic) but currently is a no-op.
//
// Ring slot policy (per .plans/loot.md §2 Q9 line 206):
//   1. ring1 empty → place in ring1
//   2. ring1 occupied, ring2 empty → place in ring2
//   3. both occupied → swap with ring1
// Deterministic; documented for replay.

const RING_PLACEMENT = { ring1: "ring1", ring2: "ring2" } as const;
type RingSlot = "ring1" | "ring2";
type SingleSlot = "weapon" | "offhand";
export type EquipmentSlot = SingleSlot | RingSlot;

const single_slot_for_kind = (kind: ItemDef["kind"]): SingleSlot | null => {
	if (kind === "weapon") return "weapon";
	if (kind === "offhand") return "offhand";
	return null;
};

const lookup_def = (ctx: Ctx, item_id: string): ItemDef | null => {
	const reg = ctx.res.get(item_registry_r);
	if (!reg.ok) return null;
	const def = reg.value.items.get(item_id as ItemId);
	return (def ?? null) as ItemDef | null;
};

const mark_dirty = (ctx: Ctx): void => {
	const ui = ctx.res.get(inventory_ui_r);
	if (!ui.ok) return;
	ctx.res.set(inventory_ui_r, { ...ui.value, dirty_stats: true });
};

const choose_ring_target = (eq: Equipment): RingSlot => {
	if (eq.ring1 === null) return RING_PLACEMENT.ring1;
	if (eq.ring2 === null) return RING_PLACEMENT.ring2;
	return RING_PLACEMENT.ring1;
};

// Moves the item at inventory.slots[slot_idx] into the appropriate equipment
// slot. If the target slot is occupied, the previously-equipped item is placed
// back into slots[slot_idx] (swap). Sets dirty_stats.
export const equip_item = (w: World, player_id: Id, ctx: Ctx, slot_idx: number, item_id: string): void => {
	const inv_r = w.get(player_id, inventory_c);
	const eq_r = w.get(player_id, equipment_c);
	if (!inv_r.ok || !eq_r.ok) return;
	const inv: Inventory = inv_r.value;
	const eq: Equipment = eq_r.value;

	const def = lookup_def(ctx, item_id);
	if (!def) return;

	const single = single_slot_for_kind(def.kind);
	const target: EquipmentSlot | null = single ?? (def.kind === "ring" ? choose_ring_target(eq) : null);
	if (!target) return;

	const displaced = eq[target];
	const next_slots = inv.slots.slice();
	next_slots[slot_idx] = displaced;
	const next_eq: Equipment = { ...eq, [target]: item_id };

	w.set(player_id, inventory_c, { slots: next_slots });
	w.set(player_id, equipment_c, next_eq);
	mark_dirty(ctx);
};

// Moves the item in equipment[slot] back into the first empty inventory slot.
// No-op if inventory is full or the equipment slot is empty.
export const unequip_item = (w: World, player_id: Id, ctx: Ctx, slot: EquipmentSlot): void => {
	const inv_r = w.get(player_id, inventory_c);
	const eq_r = w.get(player_id, equipment_c);
	if (!inv_r.ok || !eq_r.ok) return;
	const inv = inv_r.value;
	const eq = eq_r.value;

	const item_id = eq[slot];
	if (item_id === null) return;
	const empty_idx = inv.slots.findIndex((s) => s === null);
	if (empty_idx === -1) return;

	const next_slots = inv.slots.slice();
	next_slots[empty_idx] = item_id;
	const next_eq: Equipment = { ...eq, [slot]: null };

	w.set(player_id, inventory_c, { slots: next_slots });
	w.set(player_id, equipment_c, next_eq);
	mark_dirty(ctx);
};

export const make_equipment_system = (): System => () => {
	// Per-tick no-op in v1; equip ops are click-driven (inventory.ts).
};
