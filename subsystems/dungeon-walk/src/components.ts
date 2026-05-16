import { component, type Component } from "@f0rbit/forge";

export type Dir = { dx: -1 | 0 | 1; dy: -1 | 0 | 1 };

export const player_c: Component<true> = component<true>("dw.player");
export const floor_c: Component<true> = component<true>("dw.floor");
export const wall_c: Component<true> = component<true>("dw.wall");
export const exit_c: Component<true> = component<true>("dw.exit");
export const dir_c: Component<Dir> = component<Dir>("dw.dir");
export const visual_pos_c: Component<{ x: number; y: number }> = component<{ x: number; y: number }>("dw.visual_pos");
