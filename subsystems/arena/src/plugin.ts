import type { Schedule, World } from "@f0rbit/forge";

export type GamePluginOpts = Record<string, never>;

export const game_plugin = (_w: World, _sch: Schedule, _opts: GamePluginOpts = {}): void => {
	// Phase 3.1 stub — real wiring lands in Phase 3.2.
};
