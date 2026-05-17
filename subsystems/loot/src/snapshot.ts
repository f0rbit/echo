import { pos_c, snapshotter, type Snapshotter } from "@f0rbit/forge";
import {
	equipment_c,
	inventory_c,
	pickup_c,
	player_c,
	stats_c,
	visual_pos_c,
} from "./components.ts";
import { arena_r, inventory_ui_r, run_seed_r } from "./resources.ts";
import {
	arena_r_value_schema,
	equipment_c_value_schema,
	inventory_c_value_schema,
	inventory_ui_r_value_schema,
	pickup_c_value_schema,
	pos_c_value_schema,
	run_seed_r_value_schema,
	stats_c_value_schema,
	visual_pos_c_value_schema,
} from "./data/schemas.ts";

// make_loot_snapshotter — single source of truth for what's snapshotted in
// loot. Both main.ts and the replay/snapshot tests build their snapshotter
// through this factory so the registration set + order stays consistent.
//
// Registered per .plans/loot.md §2 Q10:
//   components: pos_c, visual_pos_c, player_c (marker), pickup_c,
//               inventory_c, equipment_c, stats_c
//   resources:  arena_r, run_seed_r, inventory_ui_r (subset — see schema)
//
// NOT registered (rebuilt by arena-gen on restore):
//   item_registry_r — static config; round-tripping the Map<id, def> would
//   be pure overhead. Restore preconditions: arena-gen must have run before
//   restore (or the registry must otherwise be in res). The runtime
//   schedule guarantees this; tests that restore into a fresh world must
//   either run arena-gen first or seed the registry manually.
export const make_loot_snapshotter = (): Snapshotter =>
	snapshotter()
		.register(pos_c, pos_c_value_schema)
		.register(visual_pos_c, visual_pos_c_value_schema)
		.register(player_c)
		.register(pickup_c, pickup_c_value_schema)
		.register(inventory_c, inventory_c_value_schema)
		.register(equipment_c, equipment_c_value_schema)
		.register(stats_c, stats_c_value_schema)
		.register_resource(arena_r, arena_r_value_schema)
		.register_resource(run_seed_r, run_seed_r_value_schema)
		.register_resource(inventory_ui_r, inventory_ui_r_value_schema);
