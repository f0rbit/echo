export type ItemId = string & { __brand: "ItemId" };

export type StatModifier = {
	atk?: number;
	def?: number;
	hp?: number;
	spd_mul?: number;
	crit_mul?: number;
};

export type ItemKind = "weapon" | "offhand" | "ring" | "potion";

// `frame` resolves to a named texture on the `dungeon` atlas
// (subsystems/loot/public/dungeon-atlas.json). `color` is retained as a
// fallback tint for any consumer that needs a flat 1-channel hint (none on the
// production path post-sprite-rewrite — kept to avoid churn in tests + future
// HUD pickers).
export type ItemDef = {
	id: ItemId;
	name: string;
	kind: ItemKind;
	modifier: StatModifier;
	color: number;
	frame: string;
};

const id = (s: string): ItemId => s as ItemId;

export const ITEMS: ReadonlyArray<ItemDef> = Object.freeze([
	{
		id: id("item.sword_of_fire"),
		name: "Sword of Fire",
		kind: "weapon",
		modifier: { atk: 3 },
		color: 0xff5a3c,
		frame: "weapon_red_gem_sword",
	},
	{
		id: id("item.dagger_swift"),
		name: "Swift Dagger",
		kind: "weapon",
		modifier: { atk: 1, spd_mul: 0.05 },
		color: 0xc0c8d0,
		frame: "weapon_knife",
	},
	{
		id: id("item.mace_heavy"),
		name: "Heavy Mace",
		kind: "weapon",
		modifier: { atk: 5 },
		color: 0x8a5a2a,
		frame: "weapon_big_hammer",
	},
	{
		id: id("item.staff_warding"),
		name: "Staff of Warding",
		kind: "offhand",
		modifier: { def: 2 },
		color: 0x7a8896,
		frame: "weapon_red_magic_staff",
	},
	{
		id: id("item.staff_lantern"),
		name: "Lantern Staff",
		kind: "offhand",
		modifier: { def: 1 },
		color: 0xf0c46a,
		frame: "weapon_green_magic_staff",
	},
	{
		id: id("item.ring_of_haste"),
		name: "Ring of Haste",
		kind: "ring",
		modifier: { spd_mul: 0.1 },
		color: 0x6ad8ff,
		frame: "flask_big_blue",
	},
	{
		id: id("item.ring_of_vigor"),
		name: "Ring of Vigor",
		kind: "ring",
		modifier: { hp: 3 },
		color: 0xff86a6,
		frame: "flask_big_yellow",
	},
	{
		id: id("item.ring_of_power"),
		name: "Ring of Power",
		kind: "ring",
		modifier: { atk: 1 },
		color: 0xff3c5a,
		frame: "flask_big_red",
	},
	{
		id: id("item.ring_of_warding"),
		name: "Ring of Warding",
		kind: "ring",
		modifier: { def: 1 },
		color: 0x9a86ff,
		frame: "flask_big_green",
	},
	{
		id: id("item.potion_of_healing"),
		name: "Potion of Healing",
		kind: "potion",
		modifier: { hp: 5 },
		color: 0xff4a6e,
		frame: "flask_red",
	},
	{
		id: id("item.potion_of_clarity"),
		name: "Potion of Clarity",
		kind: "potion",
		modifier: { def: 1 },
		color: 0x6affc8,
		frame: "flask_blue",
	},
	{
		id: id("item.potion_of_might"),
		name: "Potion of Might",
		kind: "potion",
		modifier: { atk: 2 },
		color: 0xffa83c,
		frame: "flask_green",
	},
]);

export type ItemRegistry = { items: Map<ItemId, ItemDef> };

export const make_item_registry = (defs: ReadonlyArray<ItemDef> = ITEMS): ItemRegistry => ({
	items: new Map(defs.map((d) => [d.id, d])),
});
