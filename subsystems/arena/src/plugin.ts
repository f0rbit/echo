import type { Schedule, System, World } from "@f0rbit/forge";
import { make_arena_gen } from "./arena-gen.ts";
import { make_input_system } from "./systems/input.ts";
import { make_movement_system } from "./systems/movement.ts";
import { make_combat_melee_system } from "./systems/combat-melee.ts";
import { make_combat_ranged_system } from "./systems/combat-ranged.ts";
import { make_enemy_ai_system } from "./systems/enemy-ai.ts";
import { make_waves_system } from "./systems/waves.ts";
import { make_restart_system } from "./systems/restart.ts";
import { hit_events_r } from "./resources.ts";

export type GamePluginOpts = Record<string, never>;

// Clears hit_events_r at the start of each tick so per-tick hit events are
// fresh. Downstream juice (flash, hitstop, shake, particles) reads these
// events in `post`.
const clear_hit_events_system: System = (_w, ctx) => {
	const r = ctx.res.get(hit_events_r);
	if (r.ok) r.value.events = [];
};

export const game_plugin = (_w: World, sch: Schedule, _opts: GamePluginOpts = {}): void => {
	sch.add("startup", make_arena_gen(), "ar.setup_arena");
	sch.add("pre", clear_hit_events_system, { phase: 0, name: "ar.hit_events_clear" });
	sch.add("pre", make_restart_system(), { phase: 1, name: "ar.restart" });
	sch.add("update", make_input_system(), { phase: 0, name: "ar.input" });
	sch.add("update", make_movement_system(), { phase: 1, name: "ar.movement" });
	sch.add("update", make_combat_melee_system(), { phase: 2, name: "ar.combat_melee" });
	sch.add("update", make_combat_ranged_system(), { phase: 3, name: "ar.combat_ranged" });
	sch.add("update", make_enemy_ai_system(), { phase: 4, name: "ar.enemy_ai" });
	sch.add("update", make_waves_system(), { phase: 5, name: "ar.waves" });
};
