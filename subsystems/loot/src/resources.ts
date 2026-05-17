import { resource, type ResKey } from "@f0rbit/forge";

export type Arena = {
	cols: number;
	rows: number;
	width: number;
	height: number;
};

export type RunSeed = { base: number; restart_count: number };

// Loose typing for now; Phase 4.1 introduces ItemDef + the concrete
// registry shape via Zod schemas.
export type ItemRegistry = {
	items: Map<string, unknown>;
};

export type InventoryUi = {
	open: boolean;
	selected_slot: number | null;
	dirty_stats: boolean;
};

export const arena_r: ResKey<Arena> = resource<Arena>("loot.arena");
export const run_seed_r: ResKey<RunSeed> = resource<RunSeed>("loot.run_seed");
export const item_registry_r: ResKey<ItemRegistry> = resource<ItemRegistry>("loot.item_registry");
export const inventory_ui_r: ResKey<InventoryUi> = resource<InventoryUi>("loot.inventory_ui");
