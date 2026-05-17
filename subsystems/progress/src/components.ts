import { component, type Component } from "@f0rbit/forge";

export type Vec2 = { x: number; y: number };
export type Cell = { x: number; y: number };
export type Dir = { dx: -1 | 0 | 1; dy: -1 | 0 | 1 };

export type Hp = { current: number; max: number };
export type Xp = { current: number; level: number };
export type Perks = { applied: readonly string[] };
export type Stats = {
	atk: number;
	def: number;
	spd: number;
	max_hp: number;
	xp_gain_mul: number;
};

// Chaser AI states (mirrors bestiary's AiState kinds; "swinging"/"dying" reserved
// for the player-side melee + death transitions added in Phase 5.3+).
export type State = { kind: "idle" | "chasing" | "swinging" | "dying" };

// A* path-following — cells array + cursor. Mirrors bestiary's Path.
export type Path = { cells: readonly Cell[]; idx: number };

export const player_c: Component<true> = component<true>("pr.player");
export const chaser_c: Component<true> = component<true>("pr.chaser");

export const hp_c: Component<Hp> = component<Hp>("pr.hp");
export const xp_c: Component<Xp> = component<Xp>("pr.xp");
export const perks_c: Component<Perks> = component<Perks>("pr.perks");
export const stats_c: Component<Stats> = component<Stats>("pr.stats");
export const state_c: Component<State> = component<State>("pr.state");
export const path_c: Component<Path> = component<Path>("pr.path");
export const dir_c: Component<Dir> = component<Dir>("pr.dir");
export const visual_pos_c: Component<Vec2> = component<Vec2>("pr.visual_pos");
