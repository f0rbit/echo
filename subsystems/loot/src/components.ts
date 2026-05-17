import { component, type Component } from "@f0rbit/forge";

export type Vec2 = { x: number; y: number };
export type Pickup = { item_id: string };
export type Inventory = { slots: (string | null)[] };
export type Equipment = {
	weapon: string | null;
	offhand: string | null;
	ring1: string | null;
	ring2: string | null;
};
export type Stats = {
	atk: number;
	def: number;
	spd: number;
	hp: number;
};

export const player_c: Component<true> = component<true>("loot.player");
export const pickup_c: Component<Pickup> = component<Pickup>("loot.pickup");
export const inventory_c: Component<Inventory> = component<Inventory>("loot.inventory");
export const equipment_c: Component<Equipment> = component<Equipment>("loot.equipment");
export const stats_c: Component<Stats> = component<Stats>("loot.stats");
export const visual_pos_c: Component<Vec2> = component<Vec2>("loot.visual_pos");
