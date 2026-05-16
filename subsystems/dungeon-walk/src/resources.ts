import { resource, type ResKey } from "@f0rbit/forge";
import type { Cell } from "@f0rbit/forge/grid";

export type Score = { reached_exit: boolean };

export type WinOverlay = { show: (visible: boolean) => void };

export type Dungeon = {
	cols: number;
	rows: number;
	floors: ReadonlySet<number>;
	spawn: Cell;
	exit: Cell;
};

export type RunSeed = { base: number; restart_count: number };

export type WallIndex = { cells: ReadonlySet<number> };

export const score_r: ResKey<Score> = resource<Score>("dw.score");
export const dungeon_r: ResKey<Dungeon> = resource<Dungeon>("dw.dungeon");
export const win_overlay_r: ResKey<WinOverlay> = resource<WinOverlay>("dw.win_overlay");
export const run_seed_r: ResKey<RunSeed> = resource<RunSeed>("dw.run_seed");
export const wall_index_r: ResKey<WallIndex> = resource<WallIndex>("dw.wall_index");
