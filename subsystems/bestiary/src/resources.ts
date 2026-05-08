import { resource, type ResKey } from "@f0rbit/forge";
import type { Cell } from "@f0rbit/forge/grid";

export type Arena = {
	cols: number;
	rows: number;
	floors: ReadonlySet<number>;
	pillars: ReadonlySet<number>;
	spawn: Cell;
};

export type RunSeed = { base: number; restart_count: number };

export type DebugVisible = { on: boolean };

export const arena_r: ResKey<Arena> = resource<Arena>("bst.arena");
export const run_seed_r: ResKey<RunSeed> = resource<RunSeed>("bst.run_seed");
export const debug_visible_r: ResKey<DebugVisible> = resource<DebugVisible>("bst.debug_visible");
