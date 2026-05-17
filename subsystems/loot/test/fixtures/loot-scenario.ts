import { harness, pos_c, type Harness, type Id } from "@f0rbit/forge";
import { game_bindings } from "../../src/bindings.ts";
import { arena_r, inventory_ui_r, item_registry_r, run_seed_r } from "../../src/resources.ts";
import { g } from "../../src/grid.ts";
import { ITEMS, make_item_registry, type ItemRegistry } from "../../src/data/items.ts";
import { equipment_c, inventory_c, player_c, stats_c, type Equipment } from "../../src/components.ts";

export type LootScenarioOpts = {
	seed?: number;
	with_player?: boolean;
	player_cell?: { x: number; y: number };
	inventory_slots?: (string | null)[];
	equipment?: Partial<Equipment>;
};

export type LootScenario = {
	h: Harness;
	tick: (real_dt?: number) => void;
	player_id: Id | null;
};

const INVENTORY_SLOT_COUNT = 12;
const fixed_dt = 1 / 60;

const empty_equipment: Equipment = { weapon: null, offhand: null, ring1: null, ring2: null };

const fill_slots = (input?: (string | null)[]): (string | null)[] => {
	const slots: (string | null)[] = Array(INVENTORY_SLOT_COUNT).fill(null);
	if (!input) return slots;
	for (let i = 0; i < INVENTORY_SLOT_COUNT && i < input.length; i++) {
		slots[i] = input[i] ?? null;
	}
	return slots;
};

export const make_test_registry = (): ItemRegistry => make_item_registry(ITEMS);

export const make_loot_scenario = (opts: LootScenarioOpts = {}): LootScenario => {
	const seed = opts.seed ?? 1;
	const h = harness({ seed, fixed_dt, bindings: game_bindings });
	h.res.set(arena_r, {
		cols: g.cols,
		rows: g.rows,
		width: g.cols * g.tile,
		height: g.rows * g.tile,
	});
	h.res.set(run_seed_r, { base: seed, restart_count: 0 });
	const reg = make_test_registry();
	h.res.set(item_registry_r, { items: reg.items as unknown as Map<string, unknown> });
	h.res.set(inventory_ui_r, { open: false, selected_slot: null, dirty_stats: false });

	let player_id: Id | null = null;
	if (opts.with_player) {
		const cell = opts.player_cell ?? { x: Math.floor(g.cols / 2), y: Math.floor(g.rows / 2) };
		const world_pos = g.cell_to_world(cell.x, cell.y);
		const equipment: Equipment = { ...empty_equipment, ...(opts.equipment ?? {}) };
		player_id = h.world.spawn(
			[player_c, true],
			[pos_c, world_pos],
			[inventory_c, { slots: fill_slots(opts.inventory_slots) }],
			[equipment_c, equipment],
			[stats_c, { atk: 5, def: 2, spd: 1.0, hp: 10 }],
		);
	}

	return { h, tick: h.tick, player_id };
};
