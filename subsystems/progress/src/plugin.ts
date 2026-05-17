import type { Schedule, World } from "@f0rbit/forge";

export type GamePluginOpts = Record<string, never>;

// Empty plugin stub — Phase 5.0 deliverable is "scaffold typechecks + builds".
// Phase 5.2+ wires real systems (input, movement, melee-swing, xp, perks,
// stats, ai-chaser, path-step, occupancy, auto-save, hud, perk-choice-ui,
// restart, entity-render, sprite-attach, tween).
export const game_plugin = (_w: World, _sch: Schedule, _opts: GamePluginOpts = {}): void => {};
