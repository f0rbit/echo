import { describe, expect, test } from "bun:test";
import { harness, pos_c, type World } from "@f0rbit/forge";
import { game_bindings } from "../src/bindings.ts";
import { equipment_c, inventory_c, pickup_c, player_c, stats_c, visual_pos_c } from "../src/components.ts";
import { ITEMS, make_item_registry, type ItemRegistry } from "../src/data/items.ts";
import { g } from "../src/grid.ts";
import { arena_r, inventory_ui_r, item_registry_r, run_seed_r } from "../src/resources.ts";
import { make_loot_snapshotter } from "../src/snapshot.ts";

const fixed_dt = 1 / 60;

const setup_world = (opts?: {
	with_player?: boolean;
	inventory?: (string | null)[];
	equipment?: { weapon?: string | null; offhand?: string | null; ring1?: string | null; ring2?: string | null };
	stats?: { atk: number; def: number; spd: number; hp: number };
	pickups?: ReadonlyArray<{ cell: { x: number; y: number }; item_id: string }>;
	ui?: { open: boolean; selected_slot: number | null };
}) => {
	const h = harness({ seed: 1, fixed_dt, bindings: game_bindings });
	h.res.set(arena_r, {
		cols: g.cols,
		rows: g.rows,
		width: g.cols * g.tile,
		height: g.rows * g.tile,
	});
	h.res.set(run_seed_r, { base: 1, restart_count: 0 });
	const reg = make_item_registry(ITEMS);
	h.res.set(item_registry_r, { items: reg.items as unknown as Map<string, unknown> });
	h.res.set(inventory_ui_r, {
		open: opts?.ui?.open ?? false,
		selected_slot: opts?.ui?.selected_slot ?? null,
		dirty_stats: false,
	});

	if (opts?.with_player) {
		const cell = { x: 10, y: 5 };
		const wp = g.cell_to_world(cell.x, cell.y);
		const slots: (string | null)[] = Array(12).fill(null);
		if (opts.inventory) {
			for (let i = 0; i < 12 && i < opts.inventory.length; i++) slots[i] = opts.inventory[i] ?? null;
		}
		const equipment = {
			weapon: opts.equipment?.weapon ?? null,
			offhand: opts.equipment?.offhand ?? null,
			ring1: opts.equipment?.ring1 ?? null,
			ring2: opts.equipment?.ring2 ?? null,
		};
		const stats = opts.stats ?? { atk: 5, def: 2, spd: 1, hp: 10 };
		h.world.spawn(
			[player_c, true],
			[pos_c, wp],
			[visual_pos_c, { ...wp }],
			[inventory_c, { slots }],
			[equipment_c, equipment],
			[stats_c, stats],
		);
	}

	if (opts?.pickups) {
		for (const p of opts.pickups) {
			const wp = g.cell_to_world(p.cell.x, p.cell.y);
			h.world.spawn([pos_c, wp], [visual_pos_c, { ...wp }], [pickup_c, { item_id: p.item_id }]);
		}
	}

	return h;
};

const seed_registry = (h: ReturnType<typeof setup_world>): void => {
	const reg = make_item_registry(ITEMS);
	h.res.set(item_registry_r, { items: reg.items as unknown as Map<string, unknown> });
};

const collect_pickups = (w: World): Array<{ cell: { x: number; y: number }; item_id: string }> => {
	const out: Array<{ cell: { x: number; y: number }; item_id: string }> = [];
	for (const [, p, pk] of w.query([pos_c, pickup_c] as const).collect()) {
		out.push({ cell: g.world_to_cell(p.x, p.y), item_id: pk.item_id });
	}
	out.sort((a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x || a.item_id.localeCompare(b.item_id));
	return out;
};

const player_state = (w: World) => {
	for (const [id, inv, eq, st] of w.query([player_c, inventory_c, equipment_c, stats_c] as const).collect()) {
		return { id, inv, eq, st };
	}
	return null;
};

describe("loot snapshot round-trip", () => {
	test("empty-ish world round-trip — only the player + base resources survive", () => {
		const h_a = setup_world({ with_player: true });
		const snap = make_loot_snapshotter().take(h_a.world, { time: h_a.time, rng: h_a.rng, res: h_a.res });
		expect(snap.ok).toBe(true);
		if (!snap.ok) return;

		const h_b = setup_world();
		seed_registry(h_b); // registry must be present before restore
		const res = make_loot_snapshotter().restore(h_b.world, snap.value, {
			time: h_b.time,
			rng: h_b.rng,
			res: h_b.res,
		});
		expect(res.ok).toBe(true);

		const a = player_state(h_a.world);
		const b = player_state(h_b.world);
		expect(a).not.toBeNull();
		expect(b).not.toBeNull();
		if (!a || !b) return;
		expect(JSON.stringify(b.inv)).toBe(JSON.stringify(a.inv));
		expect(JSON.stringify(b.eq)).toBe(JSON.stringify(a.eq));
		expect(JSON.stringify(b.st)).toBe(JSON.stringify(a.st));
	});

	test("inventory state round-trip — 3 filled slots preserved in order", () => {
		const inv = [
			"item.sword_of_fire",
			"item.ring_of_power",
			"item.potion_of_might",
		];
		const h_a = setup_world({ with_player: true, inventory: inv });
		const snap = make_loot_snapshotter().take(h_a.world, { time: h_a.time, rng: h_a.rng, res: h_a.res });
		expect(snap.ok).toBe(true);
		if (!snap.ok) return;

		const h_b = setup_world();
		seed_registry(h_b);
		const res = make_loot_snapshotter().restore(h_b.world, snap.value, { time: h_b.time, rng: h_b.rng, res: h_b.res });
		expect(res.ok).toBe(true);

		const restored = player_state(h_b.world);
		expect(restored).not.toBeNull();
		if (!restored) return;
		expect(restored.inv.slots[0]).toBe("item.sword_of_fire");
		expect(restored.inv.slots[1]).toBe("item.ring_of_power");
		expect(restored.inv.slots[2]).toBe("item.potion_of_might");
		expect(restored.inv.slots[3]).toBeNull();
		expect(restored.inv.slots.length).toBe(12);
	});

	test("equipment round-trip — every slot preserved", () => {
		const equipment = {
			weapon: "item.sword_of_fire",
			offhand: "item.staff_warding",
			ring1: "item.ring_of_power",
			ring2: "item.ring_of_haste",
		};
		const h_a = setup_world({ with_player: true, equipment });
		const snap = make_loot_snapshotter().take(h_a.world, { time: h_a.time, rng: h_a.rng, res: h_a.res });
		expect(snap.ok).toBe(true);
		if (!snap.ok) return;

		const h_b = setup_world();
		seed_registry(h_b);
		make_loot_snapshotter().restore(h_b.world, snap.value, { time: h_b.time, rng: h_b.rng, res: h_b.res });
		const restored = player_state(h_b.world);
		expect(restored).not.toBeNull();
		if (!restored) return;
		expect(restored.eq).toEqual(equipment);
	});

	test("stats round-trip — derived but registered (per §2 Q10)", () => {
		const stats = { atk: 11, def: 4, spd: 1.1, hp: 13 };
		const h_a = setup_world({ with_player: true, stats });
		const snap = make_loot_snapshotter().take(h_a.world, { time: h_a.time, rng: h_a.rng, res: h_a.res });
		expect(snap.ok).toBe(true);
		if (!snap.ok) return;

		const h_b = setup_world();
		seed_registry(h_b);
		make_loot_snapshotter().restore(h_b.world, snap.value, { time: h_b.time, rng: h_b.rng, res: h_b.res });
		const restored = player_state(h_b.world);
		expect(restored).not.toBeNull();
		if (!restored) return;
		expect(restored.st).toEqual(stats);
	});

	test("pickup entities round-trip — 5 floor pickups preserved", () => {
		const pickups = [
			{ cell: { x: 1, y: 1 }, item_id: "item.sword_of_fire" },
			{ cell: { x: 3, y: 3 }, item_id: "item.staff_warding" },
			{ cell: { x: 5, y: 5 }, item_id: "item.ring_of_power" },
			{ cell: { x: 7, y: 7 }, item_id: "item.potion_of_might" },
			{ cell: { x: 9, y: 9 }, item_id: "item.mace_heavy" },
		];
		const h_a = setup_world({ pickups });
		const snap = make_loot_snapshotter().take(h_a.world, { time: h_a.time, rng: h_a.rng, res: h_a.res });
		expect(snap.ok).toBe(true);
		if (!snap.ok) return;

		const h_b = setup_world();
		seed_registry(h_b);
		make_loot_snapshotter().restore(h_b.world, snap.value, { time: h_b.time, rng: h_b.rng, res: h_b.res });

		const before = collect_pickups(h_a.world);
		const after = collect_pickups(h_b.world);
		expect(after.length).toBe(5);
		expect(JSON.stringify(after)).toBe(JSON.stringify(before));
	});

	test("inventory_ui_r round-trip — open + selected_slot preserved", () => {
		const h_a = setup_world({ with_player: true, ui: { open: true, selected_slot: 5 } });
		const snap = make_loot_snapshotter().take(h_a.world, { time: h_a.time, rng: h_a.rng, res: h_a.res });
		expect(snap.ok).toBe(true);
		if (!snap.ok) return;

		const h_b = setup_world();
		seed_registry(h_b);
		make_loot_snapshotter().restore(h_b.world, snap.value, { time: h_b.time, rng: h_b.rng, res: h_b.res });

		const ui = h_b.res.get(inventory_ui_r);
		expect(ui.ok).toBe(true);
		if (!ui.ok) return;
		expect(ui.value.open).toBe(true);
		expect(ui.value.selected_slot).toBe(5);
	});

	test("item_registry_r is NOT in the snapshot blob (rebuilt by arena-gen on restore per §2 Q11)", () => {
		const h_a = setup_world({ with_player: true });
		const snap = make_loot_snapshotter().take(h_a.world, { time: h_a.time, rng: h_a.rng, res: h_a.res });
		expect(snap.ok).toBe(true);
		if (!snap.ok) return;

		const resource_keys = Object.keys(snap.value.resources);
		expect(resource_keys).not.toContain("loot.item_registry");
		expect(resource_keys).toContain("loot.arena");
		expect(resource_keys).toContain("loot.run_seed");
		expect(resource_keys).toContain("loot.inventory_ui");

		// Restore into a world WITH the registry pre-seeded works.
		const h_b = setup_world();
		seed_registry(h_b);
		const ok_with_registry = make_loot_snapshotter().restore(h_b.world, snap.value, {
			time: h_b.time,
			rng: h_b.rng,
			res: h_b.res,
		});
		expect(ok_with_registry.ok).toBe(true);
		const reg_after = h_b.res.get(item_registry_r);
		expect(reg_after.ok).toBe(true);
		if (reg_after.ok) {
			// Registry is untouched by the restore — still the same Map seeded
			// before restore() ran.
			expect((reg_after.value as unknown as ItemRegistry).items.has("item.sword_of_fire" as never)).toBe(true);
		}
	});

	test("transient dirty_stats is NOT visible to restored downstream systems (cleared via default)", () => {
		const h_a = setup_world({ with_player: true });
		// Live UI has dirty_stats=true (e.g. just after equip).
		h_a.res.set(inventory_ui_r, { open: false, selected_slot: null, dirty_stats: true });

		const snap = make_loot_snapshotter().take(h_a.world, { time: h_a.time, rng: h_a.rng, res: h_a.res });
		expect(snap.ok).toBe(true);
		if (!snap.ok) return;

		// Hand-mutate the snapshot to drop dirty_stats — simulating a snapshot
		// written before §2 Q10's policy was tightened (and verifying the
		// schema's .default(false) survives a missing field on restore).
		const ui_blob = snap.value.resources["loot.inventory_ui"] as Record<string, unknown>;
		delete ui_blob.dirty_stats;

		const h_b = setup_world();
		seed_registry(h_b);
		const res = make_loot_snapshotter().restore(h_b.world, snap.value, {
			time: h_b.time,
			rng: h_b.rng,
			res: h_b.res,
		});
		expect(res.ok).toBe(true);
		const ui = h_b.res.get(inventory_ui_r);
		expect(ui.ok).toBe(true);
		if (!ui.ok) return;
		expect(ui.value.dirty_stats).toBe(false);
	});
});
