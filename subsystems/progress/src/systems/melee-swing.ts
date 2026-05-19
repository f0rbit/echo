// melee-swing.ts — Z press kills a chaser adjacent to the player. Per
// .plans/progress.md §2 Q2: 1-tile melee, instant kill, XP per kill
// (XP_BASE_PER_KILL = 25).
//
// Adjacency is chebyshev-1 (8-neighbour ring, identical to
// contact-damage.ts). Rationale: path-step's `blocked_by` set includes
// the player cell so a chaser can never sit on it — a direction-cast
// melee at `player + dir_c` misses if `dir_c == {0, 0}` (stationary).
// Direction-agnostic adjacency is the cell-step analogue of "circle
// radii touching" and mirrors the contact-damage pattern so "any
// chaser that can hurt you, you can hit back".
//
// First-found chaser at chebyshev distance ≤ 1 dies. Iteration order is
// query-emission order (entity-id-stable) so replays remain
// deterministic. `dir_c` is preserved as authored facing for future
// directional effects (anim, fx) but is intentionally not consulted for
// targeting.
//
// Gated on `progress_r.paused || progress_r.dead` per §2 Q4. The
// XpSystem.emit_xp_gain closure call must run BEFORE the xp system in
// the schedule so the kill's XP is consumed on the same tick it was
// queued.
import type { Id, System, World } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { chaser_c, player_c } from "../components.ts";
import { g } from "../grid.ts";
import { progress_r } from "../resources.ts";
import { XP_BASE_PER_KILL, type XpSystem } from "./xp.ts";

const MELEE_RANGE = 1;

const find_adjacent_chaser = (w: World, player_cell: { x: number; y: number }): Id | null => {
	for (const [id, p] of w.query([pos_c, chaser_c] as const).collect()) {
		const c = g.world_to_cell(p.x, p.y);
		if (g.chebyshev(c, player_cell) <= MELEE_RANGE) return id;
	}
	return null;
};

export const make_melee_swing_system = (xp_sys: XpSystem): System => (w, ctx) => {
	const prog = ctx.res.get(progress_r);
	if (prog.ok && (prog.value.paused || prog.value.dead)) return;
	if (!ctx.input.just("swing")) return;

	const players = w.query([player_c, pos_c] as const).collect();
	const first = players[0];
	if (!first) return;
	const [, player_pos] = first;
	const player_cell = g.world_to_cell(player_pos.x, player_pos.y);

	const victim = find_adjacent_chaser(w, player_cell);
	if (victim === null) return;
	w.despawn(victim);
	xp_sys.emit_xp_gain(XP_BASE_PER_KILL);
};
