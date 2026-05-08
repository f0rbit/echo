import { component, type Component } from "@f0rbit/forge";
import type { Cell } from "@f0rbit/forge/grid";
import type { Fsm } from "./fsm.ts";

export type Dir = { dx: -1 | 0 | 1; dy: -1 | 0 | 1 };
export type AiState = { kind: "idle" | "chasing"; aggro_radius: number };
export type Path = { cells: readonly Cell[]; index: number };
export type PatrolState = "patrolling" | "pursuing" | "returning";
export type Patrol = {
	waypoints: readonly Cell[];
	index: number;
	aggro_radius: number;
	fsm: Fsm<PatrolState>;
};

export const player_c: Component<true> = component<true>("bst.player");
export const floor_c: Component<true> = component<true>("bst.floor");
export const chaser_c: Component<true> = component<true>("bst.chaser");
export const patroller_c: Component<true> = component<true>("bst.patroller");
export const dir_c: Component<Dir> = component<Dir>("bst.dir");
export const state_c: Component<AiState> = component<AiState>("bst.state");
export const path_c: Component<Path> = component<Path>("bst.path");
export const patrol_c: Component<Patrol> = component<Patrol>("bst.patrol");
