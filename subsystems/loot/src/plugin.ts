import type { Schedule, World } from "@f0rbit/forge";

export type GamePluginOpts = Record<string, never>;

export const game_plugin = (_w: World, _sch: Schedule, _opts: GamePluginOpts = {}): void => {
	// Phase 4.0 scaffold — empty stub. Real systems wired in Phase 4.2+.
};
