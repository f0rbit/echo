import { describe, expect, test } from "bun:test";
import { pos_c, type Id } from "@f0rbit/forge";
import { make_loot_scenario } from "./fixtures/loot-scenario.ts";
import { dir_c, inventory_c, pickup_c } from "../src/components.ts";
import { make_pickups_system } from "../src/systems/pickups.ts";
import { movement_system, step_every } from "../src/systems/movement.ts";
import { g } from "../src/grid.ts";

// Walk-over collection (Phase 4.3, .plans/loot.md §2 Q6).
//
// Cell-step movement runs every `step_every` ticks via the scheduler. After
// the player walks onto a pickup's cell, the pickups system (running every
// tick) detects the same-cell overlap and collects.

const SWORD = "item.sword_of_fire";
const SHIELD = "item.shield_iron";
const RING = "item.ring_of_haste";
const POTION = "item.potion_of_healing";

const PLAYER_START = { x: 5, y: 5 };

const wire = (h: ReturnType<typeof make_loot_scenario>["h"]): void => {
	h.schedule.add("update", movement_system, { every: step_every, phase: 1, name: "lt.movement" });
	h.schedule.add("update", make_pickups_system(), { phase: 2, name: "lt.pickups" });
};

const set_dir = (h: ReturnType<typeof make_loot_scenario>["h"], player_id: Id, dx: -1 | 0 | 1, dy: -1 | 0 | 1): void => {
	h.world.set(player_id, dir_c, { dx, dy });
};

const tick_n = (tick: () => void, n: number): void => {
	for (let i = 0; i < n; i++) tick();
};

describe("loot pickups — walk-over collection", () => {
	test("walking onto a pickup cell collects it into slot 0 and despawns the pickup", () => {
		const { h, player_id, tick } = make_loot_scenario({
			with_player: true,
			player_cell: PLAYER_START,
			with_pickups: [{ cell: { x: PLAYER_START.x + 1, y: PLAYER_START.y }, item_id: SWORD }],
		});
		wire(h);
		set_dir(h, player_id!, 1, 0);
		// step_every ticks for movement to fire, then one more tick to ensure
		// the pickups system observes the new player cell.
		tick_n(tick, step_every + 1);

		const inv = h.world.get(player_id!, inventory_c);
		if (!inv.ok) return;
		expect(inv.value.slots[0]).toBe(SWORD);

		const pickups = h.world.query([pos_c, pickup_c] as const).collect();
		expect(pickups.length).toBe(0);
	});

	test("walking onto a pickup with full inventory leaves the pickup on the floor", () => {
		const filled = Array(12).fill(SHIELD) as (string | null)[];
		const { h, player_id, tick } = make_loot_scenario({
			with_player: true,
			player_cell: PLAYER_START,
			inventory_slots: filled,
			with_pickups: [{ cell: { x: PLAYER_START.x + 1, y: PLAYER_START.y }, item_id: SWORD }],
		});
		wire(h);
		set_dir(h, player_id!, 1, 0);
		tick_n(tick, step_every + 1);

		const inv = h.world.get(player_id!, inventory_c);
		if (!inv.ok) return;
		expect(inv.value.slots.every((s) => s === SHIELD)).toBe(true);

		const pickups = h.world.query([pos_c, pickup_c] as const).collect();
		expect(pickups.length).toBe(1);
		const first = pickups[0];
		if (!first) return;
		const [, pos, pk] = first;
		expect(pk.item_id).toBe(SWORD);
		expect(g.world_to_cell(pos.x, pos.y)).toEqual({ x: PLAYER_START.x + 1, y: PLAYER_START.y });
	});

	test("walking past a pickup collects it as the player stands on the cell", () => {
		// Player at (5,5), pickup at (6,5). After step_every*2 ticks the player
		// has moved twice (ticks 1 and 11) and now sits at (7,5). The pickups
		// system fires every tick and caught the overlap on the intermediate
		// step.
		const { h, player_id, tick } = make_loot_scenario({
			with_player: true,
			player_cell: PLAYER_START,
			with_pickups: [{ cell: { x: PLAYER_START.x + 1, y: PLAYER_START.y }, item_id: RING }],
		});
		wire(h);
		set_dir(h, player_id!, 1, 0);
		tick_n(tick, step_every * 2);

		const inv = h.world.get(player_id!, inventory_c);
		if (!inv.ok) return;
		expect(inv.value.slots[0]).toBe(RING);

		const pickups = h.world.query([pos_c, pickup_c] as const).collect();
		expect(pickups.length).toBe(0);

		const ppos = h.world.get(player_id!, pos_c);
		if (!ppos.ok) return;
		expect(g.world_to_cell(ppos.value.x, ppos.value.y)).toEqual({ x: PLAYER_START.x + 2, y: PLAYER_START.y });
	});

	test("collects three pickups in a row in insertion order", () => {
		const { h, player_id, tick } = make_loot_scenario({
			with_player: true,
			player_cell: PLAYER_START,
			with_pickups: [
				{ cell: { x: PLAYER_START.x + 1, y: PLAYER_START.y }, item_id: SWORD },
				{ cell: { x: PLAYER_START.x + 2, y: PLAYER_START.y }, item_id: RING },
				{ cell: { x: PLAYER_START.x + 3, y: PLAYER_START.y }, item_id: POTION },
			],
		});
		wire(h);
		set_dir(h, player_id!, 1, 0);
		// 3 steps + buffer for pickups system on each.
		tick_n(tick, step_every * 3 + 2);

		const inv = h.world.get(player_id!, inventory_c);
		if (!inv.ok) return;
		expect(inv.value.slots.slice(0, 3)).toEqual([SWORD, RING, POTION]);

		const pickups = h.world.query([pos_c, pickup_c] as const).collect();
		expect(pickups.length).toBe(0);
	});
});
