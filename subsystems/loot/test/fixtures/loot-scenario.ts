import { harness, type Harness } from "@f0rbit/forge";
import { game_bindings } from "../../src/bindings.ts";
import { arena_r, inventory_ui_r, item_registry_r, run_seed_r } from "../../src/resources.ts";
import { g } from "../../src/grid.ts";
import { ITEMS, make_item_registry, type ItemRegistry } from "../../src/data/items.ts";

export type LootScenarioOpts = {
	seed?: number;
	with_player?: boolean;
};

export type LootScenario = {
	h: Harness;
	tick: (real_dt?: number) => void;
};

const fixed_dt = 1 / 60;

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
	// Phase 4.0 stub: with_player consumed once arena-gen.ts lands in Phase 4.3.
	void opts.with_player;
	return { h, tick: h.tick };
};
