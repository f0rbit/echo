import { resource, type ResKey, type Id } from "@f0rbit/forge";

export type Score = { reached_exit: boolean };

export type WinOverlay = { show: (visible: boolean) => void };

export type Cell = { x: number; y: number };

export type Dungeon = {
	cols: number;
	rows: number;
	floors: ReadonlySet<number>;
	spawn: Cell;
	exit: Cell;
};

export type CellIndex = {
	floor_at: ReadonlyMap<number, Id>;
	exit_id: Id | null;
};

export type RunSeed = { base: number; restart_count: number };

export const score_r: ResKey<Score> = resource<Score>("dw.score");
export const dungeon_r: ResKey<Dungeon> = resource<Dungeon>("dw.dungeon");
export const cell_index_r: ResKey<CellIndex> = resource<CellIndex>("dw.cell_index");
export const win_overlay_r: ResKey<WinOverlay> = resource<WinOverlay>("dw.win_overlay");
export const run_seed_r: ResKey<RunSeed> = resource<RunSeed>("dw.run_seed");
