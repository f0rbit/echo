import { z } from "zod";

export const stat_modifier_schema = z.object({
	atk: z.number().optional(),
	def: z.number().optional(),
	hp: z.number().optional(),
	spd_mul: z.number().optional(),
	crit_mul: z.number().optional(),
});

export const item_kind_schema = z.enum(["weapon", "offhand", "ring", "potion"]);

export const item_def_schema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	kind: item_kind_schema,
	modifier: stat_modifier_schema,
	color: z.number().int().nonnegative(),
});

// The Zod schemas below validate the same shapes declared in
// ../components.ts and ../resources.ts. Phase 4.5 wires these into the
// snapshot factory; the TS types stay the source of shape (components.ts
// is authoritative), and these schemas are the JSON-validation half.

export const pickup_c_value_schema = z.object({
	item_id: z.string().min(1),
});

export const inventory_c_value_schema = z.object({
	slots: z.array(z.string().min(1).nullable()).length(12),
});

export const equipment_c_value_schema = z.object({
	weapon: z.string().min(1).nullable(),
	offhand: z.string().min(1).nullable(),
	ring1: z.string().min(1).nullable(),
	ring2: z.string().min(1).nullable(),
});

export const stats_c_value_schema = z.object({
	atk: z.number(),
	def: z.number(),
	spd: z.number(),
	hp: z.number(),
});

export const visual_pos_c_value_schema = z.object({
	x: z.number(),
	y: z.number(),
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

// Per §2 Q10: `pending_click_idx` is transient and NOT registered for
// snapshot. The registered shape is just `{ open, selected_slot }`; we
// include `dirty_stats` here because it is part of the live resource shape
// — the snapshot registration in Phase 4.5 picks a subset, not this schema
// wholesale.
export const inventory_ui_r_value_schema = z.object({
	open: z.boolean(),
	selected_slot: z.number().int().nonnegative().nullable(),
	dirty_stats: z.boolean(),
});
