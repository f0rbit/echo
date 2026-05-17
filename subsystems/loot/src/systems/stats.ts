import type { System } from "@f0rbit/forge";
import { equipment_c, stats_c, player_c, type Equipment, type Stats } from "../components.ts";
import { inventory_ui_r, item_registry_r, type ItemRegistry } from "../resources.ts";
import type { ItemDef, ItemId } from "../data/items.ts";

// stats.ts — pure compute_stats + dirty-flag-gated recompute system.
//
// Composition (per .plans/loot.md §2 Q3):
//   atk, def, hp → additive  (sum of base + each equipped modifier)
//   spd          → multiplicative  (base × product of (1 + spd_mul))
//   crit_mul     → future-proof; field ignored if not consumed elsewhere
// Negative results clamp to 0 (cursed items, future).
//
// Base stats:
//   { atk: 5, def: 2, spd: 1.0, hp: 10 }

export const BASE_STATS: Stats = { atk: 5, def: 2, spd: 1.0, hp: 10 };

const EQUIPMENT_SLOTS: readonly (keyof Equipment)[] = ["weapon", "offhand", "ring1", "ring2"];

const def_of = (registry: ItemRegistry, item_id: string): ItemDef | null => {
	return (registry.items.get(item_id as ItemId) ?? null) as ItemDef | null;
};

export const compute_stats = (base: Stats, equipment: Equipment, registry: ItemRegistry): Stats => {
	const equipped_defs = EQUIPMENT_SLOTS.map((s) => equipment[s])
		.filter((id): id is string => id !== null)
		.map((id) => def_of(registry, id))
		.filter((d): d is ItemDef => d !== null);

	const atk_sum = equipped_defs.reduce((acc, d) => acc + (d.modifier.atk ?? 0), 0);
	const def_sum = equipped_defs.reduce((acc, d) => acc + (d.modifier.def ?? 0), 0);
	const hp_sum = equipped_defs.reduce((acc, d) => acc + (d.modifier.hp ?? 0), 0);
	const spd_product = equipped_defs.reduce((acc, d) => acc * (1 + (d.modifier.spd_mul ?? 0)), 1);

	return {
		atk: Math.max(0, base.atk + atk_sum),
		def: Math.max(0, base.def + def_sum),
		hp: Math.max(0, base.hp + hp_sum),
		spd: Math.max(0, base.spd * spd_product),
	};
};

export const make_stats_recompute_system = (): System => (w, ctx) => {
	const ui = ctx.res.get(inventory_ui_r);
	if (!ui.ok || !ui.value.dirty_stats) return;
	const reg = ctx.res.get(item_registry_r);
	if (!reg.ok) return;
	const registry = reg.value as ItemRegistry;

	for (const [id, , equipment] of w.query([player_c, stats_c, equipment_c] as const).collect()) {
		const next = compute_stats(BASE_STATS, equipment, registry);
		w.set(id, stats_c, next);
	}

	ctx.res.set(inventory_ui_r, { ...ui.value, dirty_stats: false });
};
