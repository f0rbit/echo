// melee-swing.ts — Z press kills the chaser in the cell adjacent to the
// player in the `dir_c` direction. Per .plans/progress.md §2 Q2: 1-tile
// melee, instant kill, XP per kill (XP_BASE_PER_KILL = 25).
//
// Same-cell detection: target_cell = player_cell + (dir_c.dx, dir_c.dy).
// If the player has not moved yet, `dir_c` is `{ dx:0, dy:0 }` and
// target_cell == player_cell — no chaser can be there (occupancy bars
// it), so the swing is a no-op. Once the player has stepped at least
// once, `dir_c` persists (cell-step facing convention; bestiary input).
//
// Gated on `progress_r.paused` per §2 Q4. The XpSystem.emit_xp_gain
// closure call must run BEFORE the xp system in the schedule so the
// kill's XP is consumed on the same tick it was queued.
import type { Ctx, Id, System, World } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { chaser_c, dir_c, player_c } from "../components.ts";
import { g } from "../grid.ts";
import { progress_r } from "../resources.ts";
import { XP_BASE_PER_KILL, type XpSystem } from "./xp.ts";

const find_target_cell = (w: World, player_id: Id): { x: number; y: number } | null => {
	const pos = w.get(player_id, pos_c);
	const dir = w.get(player_id, dir_c);
	if (!pos.ok || !dir.ok) return null;
	const cur = g.world_to_cell(pos.value.x, pos.value.y);
	return { x: cur.x + dir.value.dx, y: cur.y + dir.value.dy };
};

const find_chaser_at = (w: World, target: { x: number; y: number }): Id | null => {
	const target_key = g.key(target.x, target.y);
	for (const [id, p] of w.query([pos_c, chaser_c] as const).collect()) {
		const c = g.world_to_cell(p.x, p.y);
		if (g.key(c.x, c.y) === target_key) return id;
	}
	return null;
};

export const make_melee_swing_system = (xp_sys: XpSystem): System => (w, ctx) => {
	const prog = ctx.res.get(progress_r);
	if (prog.ok && prog.value.paused) return;
	if (!ctx.input.just("swing")) return;

	const players = w.query([player_c] as const).collect();
	const first = players[0];
	if (!first) return;
	const player_id = first[0];

	const target = find_target_cell(w, player_id);
	if (target === null) return;
	// dir_c { dx: 0, dy: 0 } → target == player cell → no chaser there.
	if (!g.in_bounds(target.x, target.y)) return;

	const victim = find_chaser_at(w, target);
	if (victim === null) return;
	w.despawn(victim);
	xp_sys.emit_xp_gain(XP_BASE_PER_KILL);
	// ctx is intentionally unused beyond the paused gate above.
	void ctx;
};
