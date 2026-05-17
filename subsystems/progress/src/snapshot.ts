import { pos_c, snapshotter, type Snapshotter } from "@f0rbit/forge";
import {
	chaser_c,
	dir_c,
	hp_c,
	path_c,
	perks_c,
	player_c,
	state_c,
	stats_c,
	visual_pos_c,
	xp_c,
} from "./components.ts";
import {
	arena_r,
	level_up_pending_r,
	progress_r,
	run_seed_r,
} from "./resources.ts";
import {
	arena_r_value_schema,
	dir_c_value_schema,
	hp_c_value_schema,
	level_up_pending_r_value_schema,
	path_c_value_schema,
	perks_c_value_schema,
	pos_c_value_schema,
	progress_r_value_schema,
	run_seed_r_value_schema,
	state_c_value_schema,
	stats_c_value_schema,
	visual_pos_c_value_schema,
	xp_c_value_schema,
} from "./data/schemas.ts";

// make_progress_snapshotter — single source of truth for what's snapshotted
// in progress. main.ts (Phase 5.5 disk save/load) and Phase 5.6's replay /
// snapshot round-trip tests both build their snapshotter through this
// factory so the registration set + order stay consistent.
//
// Registered per .plans/progress.md §2 Q10:
//   components: pos_c, visual_pos_c, dir_c, player_c (marker),
//               chaser_c (marker), hp_c, xp_c, perks_c, stats_c, state_c,
//               path_c
//   resources:  arena_r, run_seed_r, progress_r, level_up_pending_r
//
// NOT registered (rehydrated by setup_arena / runtime systems on restore):
//   perk_registry_r       — static config; rehydrated by setup_arena
//                           (AGENTS.md "Static config NOT in snapshot").
//   creature_occupancy_r  — runtime-derived; rebuilt each tick by
//                           creature_occupancy_system.
//   wall_index_r          — runtime-derived; empty in progress v1 (no
//                           walls), but the resource exists so the copied
//                           bestiary systems compile unchanged.
export const make_progress_snapshotter = (): Snapshotter =>
	snapshotter()
		.register(pos_c, pos_c_value_schema)
		.register(visual_pos_c, visual_pos_c_value_schema)
		.register(dir_c, dir_c_value_schema)
		.register(player_c)
		.register(chaser_c)
		.register(hp_c, hp_c_value_schema)
		.register(xp_c, xp_c_value_schema)
		.register(perks_c, perks_c_value_schema)
		.register(stats_c, stats_c_value_schema)
		.register(state_c, state_c_value_schema)
		.register(path_c, path_c_value_schema)
		.register_resource(arena_r, arena_r_value_schema)
		.register_resource(run_seed_r, run_seed_r_value_schema)
		.register_resource(progress_r, progress_r_value_schema)
		.register_resource(level_up_pending_r, level_up_pending_r_value_schema);
