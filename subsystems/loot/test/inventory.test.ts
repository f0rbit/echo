import { describe, expect, test } from "bun:test";
import { pos_c } from "@f0rbit/forge";
import { make_loot_scenario } from "./fixtures/loot-scenario.ts";
import { make_inventory_system, try_add_item } from "../src/systems/inventory.ts";
import { equipment_c, inventory_c, pickup_c } from "../src/components.ts";
import { inventory_ui_r } from "../src/resources.ts";
import { g } from "../src/grid.ts";

const SWORD = "item.sword_of_fire";
const SHIELD = "item.shield_iron";
const RING1 = "item.ring_of_haste";
const RING2 = "item.ring_of_vigor";
const RING3 = "item.ring_of_power";
const POTION = "item.potion_of_healing";

describe("loot inventory — try_add_item", () => {
	test("add to empty inventory writes slot 0 and returns true", () => {
		const { h, player_id } = make_loot_scenario({ with_player: true });
		expect(player_id).not.toBeNull();
		const ok = try_add_item(h.world, player_id!, h.ctx, SWORD);
		expect(ok).toBe(true);
		const inv = h.world.get(player_id!, inventory_c);
		expect(inv.ok).toBe(true);
		if (!inv.ok) return;
		expect(inv.value.slots[0]).toBe(SWORD);
	});

	test("add to full inventory returns false and leaves slots untouched", () => {
		const filled = Array(12).fill(SHIELD) as (string | null)[];
		const { h, player_id } = make_loot_scenario({ with_player: true, inventory_slots: filled });
		const before = h.world.get(player_id!, inventory_c);
		expect(before.ok).toBe(true);
		const ok = try_add_item(h.world, player_id!, h.ctx, SWORD);
		expect(ok).toBe(false);
		const after = h.world.get(player_id!, inventory_c);
		if (!before.ok || !after.ok) return;
		expect(after.value.slots).toEqual(before.value.slots);
	});
});

describe("loot inventory — click semantics", () => {
	test("click empty slot is a no-op", () => {
		const { h, player_id, tick } = make_loot_scenario({ with_player: true });
		const inv_sys = make_inventory_system();
		h.schedule.add("update", inv_sys.system, { name: "inventory" });
		inv_sys.queue_click(3);
		tick();
		const inv = h.world.get(player_id!, inventory_c);
		const eq = h.world.get(player_id!, equipment_c);
		const ui = h.res.get(inventory_ui_r);
		if (!inv.ok || !eq.ok || !ui.ok) return;
		expect(inv.value.slots.every((s) => s === null)).toBe(true);
		expect(eq.value).toEqual({ weapon: null, offhand: null, ring1: null, ring2: null });
		expect(ui.value.dirty_stats).toBe(false);
	});

	test("click slot with weapon equips it; sets dirty_stats", () => {
		const { h, player_id, tick } = make_loot_scenario({ with_player: true, inventory_slots: [SWORD] });
		const inv_sys = make_inventory_system();
		h.schedule.add("update", inv_sys.system, { name: "inventory" });
		inv_sys.queue_click(0);
		tick();
		const inv = h.world.get(player_id!, inventory_c);
		const eq = h.world.get(player_id!, equipment_c);
		const ui = h.res.get(inventory_ui_r);
		if (!inv.ok || !eq.ok || !ui.ok) return;
		expect(eq.value.weapon).toBe(SWORD);
		expect(inv.value.slots[0]).toBeNull();
		expect(ui.value.dirty_stats).toBe(true);
	});

	test("click weapon slot when weapon equipped swaps", () => {
		const { h, player_id, tick } = make_loot_scenario({
			with_player: true,
			inventory_slots: [SWORD],
			equipment: { weapon: "item.mace_heavy" },
		});
		const inv_sys = make_inventory_system();
		h.schedule.add("update", inv_sys.system, { name: "inventory" });
		inv_sys.queue_click(0);
		tick();
		const inv = h.world.get(player_id!, inventory_c);
		const eq = h.world.get(player_id!, equipment_c);
		if (!inv.ok || !eq.ok) return;
		expect(eq.value.weapon).toBe(SWORD);
		expect(inv.value.slots[0]).toBe("item.mace_heavy");
	});

	test("ring policy: both ring slots empty → ring1; ring1 full → ring2; both full → swap with ring1", () => {
		// case A — both empty
		{
			const { h, player_id, tick } = make_loot_scenario({ with_player: true, inventory_slots: [RING1] });
			const inv_sys = make_inventory_system();
			h.schedule.add("update", inv_sys.system, { name: "inventory" });
			inv_sys.queue_click(0);
			tick();
			const eq = h.world.get(player_id!, equipment_c);
			if (!eq.ok) return;
			expect(eq.value.ring1).toBe(RING1);
			expect(eq.value.ring2).toBeNull();
		}
		// case B — ring1 occupied
		{
			const { h, player_id, tick } = make_loot_scenario({
				with_player: true,
				inventory_slots: [RING2],
				equipment: { ring1: RING1 },
			});
			const inv_sys = make_inventory_system();
			h.schedule.add("update", inv_sys.system, { name: "inventory" });
			inv_sys.queue_click(0);
			tick();
			const eq = h.world.get(player_id!, equipment_c);
			if (!eq.ok) return;
			expect(eq.value.ring1).toBe(RING1);
			expect(eq.value.ring2).toBe(RING2);
		}
		// case C — both occupied → swap with ring1
		{
			const { h, player_id, tick } = make_loot_scenario({
				with_player: true,
				inventory_slots: [RING3],
				equipment: { ring1: RING1, ring2: RING2 },
			});
			const inv_sys = make_inventory_system();
			h.schedule.add("update", inv_sys.system, { name: "inventory" });
			inv_sys.queue_click(0);
			tick();
			const inv = h.world.get(player_id!, inventory_c);
			const eq = h.world.get(player_id!, equipment_c);
			if (!inv.ok || !eq.ok) return;
			expect(eq.value.ring1).toBe(RING3);
			expect(eq.value.ring2).toBe(RING2);
			expect(inv.value.slots[0]).toBe(RING1);
		}
	});

	test("click potion drops it on the floor at the player cell; slot nullified", () => {
		const player_cell = { x: 5, y: 5 };
		const { h, player_id, tick } = make_loot_scenario({
			with_player: true,
			player_cell,
			inventory_slots: [POTION],
		});
		const inv_sys = make_inventory_system();
		h.schedule.add("update", inv_sys.system, { name: "inventory" });
		inv_sys.queue_click(0);
		tick();
		const inv = h.world.get(player_id!, inventory_c);
		if (!inv.ok) return;
		expect(inv.value.slots[0]).toBeNull();

		const pickups = h.world.query([pos_c, pickup_c] as const).collect();
		expect(pickups.length).toBe(1);
		const first = pickups[0];
		if (!first) return;
		const [, pos, pick] = first;
		expect(pick.item_id).toBe(POTION);
		const cell = g.world_to_cell(pos.x, pos.y);
		expect(cell).toEqual(player_cell);
	});
});
