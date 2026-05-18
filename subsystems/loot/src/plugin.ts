import type { Schedule, World } from "@f0rbit/forge";
import { make_wall_autotile_system } from "@f0rbit/forge/autotile";
import { wall_c } from "./components.ts";
import { g } from "./grid.ts";
import { make_arena_gen_system } from "./arena-gen.ts";
import { make_input_system } from "./systems/input.ts";
import { make_inventory_system, type InventorySystem } from "./systems/inventory.ts";
import { movement_system, step_every } from "./systems/movement.ts";
import { make_pickups_system } from "./systems/pickups.ts";
import { make_restart_system } from "./systems/restart.ts";
import { sprite_attach_system } from "./systems/sprite-attach.ts";
import { make_stats_recompute_system } from "./systems/stats.ts";
import { make_synthetic_slot_click_system } from "./systems/synthetic-slot-click.ts";
import { tween_step_system } from "./systems/tween.ts";

export type GamePluginOpts = {
	inventory_system?: InventorySystem;
};

// plugin.ts — wires the schedule.
//
// Stage ordering (mirrors bestiary's cell-step layout):
//   startup → arena_gen
//   pre     → restart
//   update  → input → movement (every step_every) → pickups → inventory →
//             stats_recompute
//   post    → sprite_attach → tween
//
// Rendering is handled by forge's built-in sprite_sync_system (auto-installed
// by `boot()` when an `assets` + `pos` pair is configured). `sprite_attach`
// writes sprite_c onto player / pickup entities; forge syncs them to actual
// Pixi Sprites every post tick.
//
// `make_inventory_system()` returns { system, queue_click }. The host (main.ts
// or tests) creates it before plugin install so it can wire DOM pointerdown
// → queue_click. Tests pass their own instance via opts.inventory_system.

export const game_plugin = (_w: World, sch: Schedule, opts: GamePluginOpts = {}): InventorySystem => {
	const inv = opts.inventory_system ?? make_inventory_system();

	sch.add("startup", make_arena_gen_system(), { name: "lt.arena_gen" });

	sch.add("pre", make_restart_system(), { phase: 0, name: "lt.restart" });
	sch.add("pre", make_wall_autotile_system({ wall_c, texture: "walls", grid: g }), { phase: 1, name: "lt.wall_autotile" });

	sch.add("update", make_input_system(), { phase: 0, name: "lt.input" });
	sch.add("update", movement_system, { every: step_every, phase: 1, name: "lt.movement" });
	sch.add("update", make_pickups_system(), { phase: 2, name: "lt.pickups" });
	// Synthetic slot-click drains replay events into the same queue the DOM
	// pointer handler writes to; runs BEFORE inv.system so queued clicks are
	// processed on the same tick the action edge fires.
	sch.add("update", make_synthetic_slot_click_system(inv.queue_click), { phase: 2.5, name: "lt.synthetic_slot_click" });
	sch.add("update", inv.system, { phase: 3, name: "lt.inventory" });
	sch.add("update", make_stats_recompute_system(), { phase: 4, name: "lt.stats_recompute" });

	sch.add("post", sprite_attach_system, { phase: 0, name: "lt.sprite_attach" });
	sch.add("post", tween_step_system, { phase: 1, name: "lt.tween" });

	return inv;
};
