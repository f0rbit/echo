import { resource, type ResKey } from "@f0rbit/forge";

export type Arena = {
	cols: number;
	rows: number;
	width: number;
	height: number;
};

export type RunSeed = { base: number; restart_count: number };

// Loose typing for now; Phase 5.1 introduces PerkDef + the concrete
// registry shape via Zod schemas.
// NOT snapshotted — static config, rehydrated by setup_progress.
export type PerkRegistry = {
	perks: Map<string, unknown>;
};

// Mirrors bestiary's CreatureOccupancy: per-tick set of occupied cell keys
// (encoded ints). Rebuilt each tick by the occupancy system (Phase 5.3).
export type CreatureOccupancy = { cells: ReadonlySet<number> };

// Mirrors bestiary's WallIndex. progress has no walls in v1 — the set stays
// empty — but the resource exists so copied chaser/path-step systems compile
// unchanged.
export type WallIndex = { cells: ReadonlySet<number> };

// Game-state gate (per AGENTS.md "Game-state gates, NOT time.scale = 0"):
//   paused — true while level_up_pending_r.pending is true; gameplay systems
//            early-return; the perk-pick consumer is the sole release path.
//   dirty_stats — set when perks change; consumed by stats-recompute system.
//   dead — set by contact-damage when player hp hits 0; gameplay systems
//          gate on `paused || dead`. Cleared by restart.ts.
export type Progress = { paused: boolean; dirty_stats: boolean; dead: boolean };

// Level-up gate: 3 perk ids drawn when XP threshold crosses. The pick-perk
// systems (Phase 5.4) drain `choices` and clear `pending`.
export type LevelUpPending = { pending: boolean; choices: readonly string[] };

export const arena_r: ResKey<Arena> = resource<Arena>("pr.arena");
export const run_seed_r: ResKey<RunSeed> = resource<RunSeed>("pr.run_seed");
export const perk_registry_r: ResKey<PerkRegistry> = resource<PerkRegistry>("pr.perk_registry");
export const creature_occupancy_r: ResKey<CreatureOccupancy> = resource<CreatureOccupancy>("pr.creature_occupancy");
export const wall_index_r: ResKey<WallIndex> = resource<WallIndex>("pr.wall_index");
export const progress_r: ResKey<Progress> = resource<Progress>("pr.progress");
export const level_up_pending_r: ResKey<LevelUpPending> = resource<LevelUpPending>("pr.level_up_pending");
