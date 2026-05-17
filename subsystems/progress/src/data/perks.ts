export type PerkId = string & { __brand: "PerkId" };

export type StatModifier = {
	atk?: number;
	def?: number;
	hp?: number;
	spd_mul?: number;
	xp_gain_mul?: number;
};

export type PerkDef = {
	id: PerkId;
	name: string;
	modifier: StatModifier;
};

const id = (s: string): PerkId => s as PerkId;

export const PERKS: ReadonlyArray<PerkDef> = Object.freeze([
	{
		id: id("perk.atk_plus"),
		name: "Sharpened Blade",
		modifier: { atk: 3 },
	},
	{
		id: id("perk.def_plus"),
		name: "Hardened Hide",
		modifier: { def: 2 },
	},
	{
		id: id("perk.spd_plus"),
		name: "Swift Step",
		modifier: { spd_mul: 0.15 },
	},
	{
		id: id("perk.hp_plus"),
		name: "Iron Heart",
		modifier: { hp: 5 },
	},
	{
		id: id("perk.xp_gain"),
		name: "Quick Learner",
		modifier: { xp_gain_mul: 0.25 },
	},
]);

export type PerkRegistry = { perks: Map<PerkId, PerkDef> };

export const make_perk_registry = (defs: ReadonlyArray<PerkDef> = PERKS): PerkRegistry => ({
	perks: new Map(defs.map((d) => [d.id, d])),
});

/**
 * XP required to advance from level N to level N+1.
 * Linear: 100 * level (per .plans/progress.md §2 Q5).
 *   level 1 → 2 = 100 XP
 *   level 2 → 3 = 200 XP
 *   level 3 → 4 = 300 XP
 *   level N → N+1 = 100 * N
 * level < 1 returns 0 (no threshold defined below level 1).
 */
export const xp_threshold = (level: number): number => {
	if (level < 1) return 0;
	return 100 * level;
};
