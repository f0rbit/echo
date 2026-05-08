import { component, type Component } from "@f0rbit/forge";

export type Dir = { dx: -1 | 0 | 1; dy: -1 | 0 | 1 };

export const player_c: Component<true> = component<true>("bst.player");
export const floor_c: Component<true> = component<true>("bst.floor");
export const dir_c: Component<Dir> = component<Dir>("bst.dir");
