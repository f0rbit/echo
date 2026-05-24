import { z } from "zod";

export const stat_modifier_schema = z.object({
	atk: z.number().optional(),
	def: z.number().optional(),
	hp: z.number().optional(),
	spd_mul: z.number().optional(),
	xp_gain_mul: z.number().optional(),
});

export const perk_def_schema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	modifier: stat_modifier_schema,
});

// The Zod schemas below validate the same shapes declared in
// ../components.ts and ../resources.ts. Phase 5.6 wires these into the
// snapshot factory; the TS types stay the source of shape (components.ts /
// resources.ts are authoritative), and these schemas are the JSON-validation
// half. Snapshot scope mirrors .plans/progress.md §2 Q10.

export const pos_c_value_schema = z.object({
	x: z.number(),
	y: z.number(),
});

export const visual_pos_c_value_schema = z.object({
	x: z.number(),
	y: z.number(),
});

export const dir_c_value_schema = z.object({
	dx: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
	dy: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
});

export const hp_c_value_schema = z.object({
	current: z.number(),
	max: z.number(),
});

export const xp_c_value_schema = z.object({
	current: z.number(),
	level: z.number().int(),
});

export const perks_c_value_schema = z.object({
	applied: z.array(z.string().min(1)),
});

export const stats_c_value_schema = z.object({
	atk: z.number(),
	def: z.number(),
	spd: z.number(),
	max_hp: z.number(),
	xp_gain_mul: z.number(),
});

export const state_c_value_schema = z.object({
	kind: z.enum(["idle", "chasing", "swinging", "dying"]),
});

export const path_c_value_schema = z.object({
	cells: z.array(z.object({ x: z.number().int(), y: z.number().int() })),
	idx: z.number().int().nonnegative(),
});

export const arena_r_value_schema = z.object({
	cols: z.number().int().positive(),
	rows: z.number().int().positive(),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
});

export const run_seed_r_value_schema = z.object({
	base: z.number().int(),
	restart_count: z.number().int().nonnegative(),
});

// Per §2 Q10 line 234: `paused` survives restore so a save mid-level-up
// reloads into a pause. `dirty_stats` is a transient flag set by perk-pick
// and cleared by stats-recompute mid-tick; included so the resource shape
// round-trips, but it diverges between original and restored sims (restored
// stats are already final). `dead` survives restore so a save-on-death
// reloads frozen with the restart prompt up. `.default(false)` on both
// keeps loads tolerant of older JSON blobs that omit the field — mirrors
// loot's inventory_ui_r pattern.
export const progress_r_value_schema = z.object({
	paused: z.boolean(),
	dirty_stats: z.boolean().default(false),
	dead: z.boolean().default(false),
});

// Per §2 Q10 line 235: if you save mid-pick, you reload mid-pick.
export const level_up_pending_r_value_schema = z.object({
	pending: z.boolean(),
	choices: z.array(z.string().min(1)),
});

// Swing window — `active_until_tick` is the exclusive end-tick of the
// current swing's active window (0 = no swing queued). `.default(0)`
// keeps loads tolerant of older JSON blobs that omit the field — same
// pattern as progress_r.dirty_stats.
export const swing_state_r_value_schema = z.object({
	active_until_tick: z.number().int().nonnegative().default(0),
});

// NOT included (per §2 Q10):
//   - perk_registry_r — static config, rehydrated by setup_progress
//     (AGENTS.md "Static config NOT in snapshot").
//   - creature_occupancy_r — runtime-derived, rebuilt each tick by the
//     occupancy system.
//   - wall_index_r — runtime-derived from wall entities (empty in v1).
//   - player_c / chaser_c — marker components, no value to validate.
