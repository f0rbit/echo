// FORGE-PROMOTION-CANDIDATE: copied from
// subsystems/bestiary/src/systems/creature-occupancy.ts. progress is
// the 2nd consumer (boss Phase 6 will be the 3rd). Phase 8 (`main`)
// should extract to @f0rbit/forge per AGENTS.md §5 promotion criteria.
//
// Adaptations from the bestiary original:
//   1. queries `chaser_c` directly — no umbrella `enemy_c` in progress.
//   2. NOT gated on `progress_r.paused`: occupancy is a derived
//      resource (rebuild lifecycle), not a gameplay decision. Keeping
//      it fresh while paused is harmless.
//
// If you edit this file, sync the change back to bestiary's copy
// (and forward to any other copy that exists). Annotated 2026-05-18.
import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { chaser_c, player_c } from "../components.ts";
import { g } from "../grid.ts";
import { creature_occupancy_r } from "../resources.ts";

export const creature_occupancy_system: System = (w, ctx) => {
	const cells = new Set<number>();
	for (const [, p] of w.query([pos_c, chaser_c] as const).collect()) {
		const c = g.world_to_cell(p.x, p.y);
		cells.add(g.key(c.x, c.y));
	}
	for (const [, p] of w.query([pos_c, player_c] as const).collect()) {
		const c = g.world_to_cell(p.x, p.y);
		cells.add(g.key(c.x, c.y));
	}
	ctx.res.set(creature_occupancy_r, { cells });
};
