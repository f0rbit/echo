// FORGE-PROMOTION-CANDIDATE: 2nd consumer of compose_stats pattern
// (1st was subsystems/loot/src/systems/stats.ts). Wait for boss or progress
// expansion as 3rd consumer per AGENTS.md §5 promotion criteria, then
// extract to @f0rbit/forge/stats.
//
// Composition (per .plans/progress.md §2 Q3):
//   atk, def, max_hp        → additive  (sum of base + each perk modifier)
//   spd, xp_gain_mul        → multiplicative  (base × product of (1 + mod))
// Negative results clamp to 0 (future-proof for cursed perks).
//
// Diverges from loot's stats.ts in two ways:
//   1. source is `perks_c.applied: PerkId[]` (variable-length), not the
//      4-slot Equipment shape.
//   2. `xp_gain_mul` is a perk-only field surfaced on Stats so xp.ts can
//      read it without re-walking perks_c on every kill.
import type { System } from "@f0rbit/forge";
import { perks_c, player_c, stats_c, type Perks, type Stats } from "../components.ts";
import { perk_registry_r, progress_r } from "../resources.ts";
import type { PerkDef, PerkId, PerkRegistry } from "../data/perks.ts";

export const BASE_STATS: Stats = { atk: 5, def: 2, spd: 1.0, max_hp: 10, xp_gain_mul: 0 };

const def_of = (registry: PerkRegistry, id: string): PerkDef | null => {
	return registry.perks.get(id as PerkId) ?? null;
};

export const compute_stats = (base: Stats, perks: Perks, registry: PerkRegistry): Stats => {
	const defs = perks.applied
		.map((id) => def_of(registry, id))
		.filter((d): d is PerkDef => d !== null);

	const atk_sum = defs.reduce((acc, d) => acc + (d.modifier.atk ?? 0), 0);
	const def_sum = defs.reduce((acc, d) => acc + (d.modifier.def ?? 0), 0);
	const hp_sum = defs.reduce((acc, d) => acc + (d.modifier.hp ?? 0), 0);
	const spd_product = defs.reduce((acc, d) => acc * (1 + (d.modifier.spd_mul ?? 0)), 1);
	const xp_gain_product = defs.reduce((acc, d) => acc * (1 + (d.modifier.xp_gain_mul ?? 0)), 1);

	return {
		atk: Math.max(0, base.atk + atk_sum),
		def: Math.max(0, base.def + def_sum),
		max_hp: Math.max(0, base.max_hp + hp_sum),
		spd: Math.max(0, base.spd * spd_product),
		// xp_gain_mul is stored as a "delta over 1" so xp.ts can multiply by
		// (1 + stats.xp_gain_mul) without knowing the base. base.xp_gain_mul
		// is 0, so the product of (1 + perk_mul) terms minus 1 gives the
		// additive delta even when multiple perks stack.
		xp_gain_mul: base.xp_gain_mul + (xp_gain_product - 1),
	};
};

export const make_stats_recompute_system = (): System => (w, ctx) => {
	const prog = ctx.res.get(progress_r);
	if (!prog.ok || !prog.value.dirty_stats) return;
	const reg = ctx.res.get(perk_registry_r);
	if (!reg.ok) return;
	const registry = reg.value as unknown as PerkRegistry;

	for (const [id, , perks] of w.query([player_c, stats_c, perks_c] as const).collect()) {
		const next = compute_stats(BASE_STATS, perks, registry);
		w.set(id, stats_c, next);
	}

	ctx.res.set(progress_r, { ...prog.value, dirty_stats: false });
};
