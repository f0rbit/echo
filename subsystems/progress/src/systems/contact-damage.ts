// contact-damage.ts — chaser-on-player adjacency collision (cell-step
// counterpart to arena's circle-vs-circle enemy-ai contact path). Phase
// 5.3 copied bestiary's pursuit-only chaser AI without wiring a damage
// path, so chasers walked up to the player and stopped. This system
// closes that gap.
//
// Why chebyshev-1 adjacency, not same-cell:
//   path-step's `blocked_by` treats the player's cell as occupied (it
//   adds player + every chaser to the occupancy set), so a pursuing
//   chaser never actually steps onto the player's cell — it stops one
//   cell away. Same-cell overlap is therefore unreachable in normal
//   play. Adjacency (chebyshev distance ≤ 1, includes diagonals) is the
//   cell-step analogue of "circle radii touching" and reliably fires.
//
// Each tick (after `path_step` so chaser positions are current):
//   1. Find the player cell.
//   2. For every chaser at chebyshev distance ≤ 1 (4 cardinals + 4
//      diagonals + same cell):
//      - Decrement `hp_c.current` by CONTACT_DAMAGE.
//      - Despawn the chaser (sacrifice-on-contact, mirrors arena's
//        enemy-ai pattern in subsystems/arena/src/systems/enemy-ai.ts).
//      - On hp ≤ 0, set `progress_r.dead = true`. All gameplay systems
//        (input, movement, melee-swing, enemy-spawn) gate on
//        `paused || dead`; restart.ts clears the flag.
//
// Gated on `progress_r.paused || progress_r.dead`:
//   - paused: no damage during level-up modal (consistency with every
//     other gameplay system).
//   - dead: don't keep ticking damage on a corpse (and don't double-set
//     dead).
//
// No hit-events resource yet — progress doesn't carry one (per
// snapshot.ts). Direct hp decrement is sufficient for v1.
import { pos_c, type System } from "@f0rbit/forge";
import { chaser_c, hp_c, player_c } from "../components.ts";
import { g } from "../grid.ts";
import { hit_events_r, hitstop_r, progress_r } from "../resources.ts";

const CONTACT_DAMAGE = 1;
const CONTACT_RANGE = 1;

export const make_contact_damage_system = (): System => (w, ctx) => {
	const prog = ctx.res.get(progress_r);
	if (!prog.ok) return;
	if (prog.value.paused || prog.value.dead) return;
	const hs = ctx.res.get(hitstop_r);
	if (hs.ok && hs.value.remaining > 0) return;

	const players = w.query([player_c, pos_c, hp_c] as const).collect();
	const first = players[0];
	if (!first) return;
	const [player_id, player_pos] = first;
	const player_cell = g.world_to_cell(player_pos.x, player_pos.y);

	const events = ctx.res.get(hit_events_r);
	for (const [chaser_id, cp] of w.query([chaser_c, pos_c] as const).collect()) {
		const cc = g.world_to_cell(cp.x, cp.y);
		if (g.chebyshev(cc, player_cell) > CONTACT_RANGE) continue;
		const hp = w.get(player_id, hp_c);
		if (!hp.ok) return;
		const next = Math.max(0, hp.value.current - CONTACT_DAMAGE);
		w.set(player_id, hp_c, { current: next, max: hp.value.max });
		// Emit `damage` hit_event so the juice systems route this as
		// "took damage" (red player flash, smaller red particle burst,
		// medium-mag shake, brief hitstop) — distinct from the kill
		// burst that fires when YOU land a melee hit. Target is the
		// player (flash tints the player red); particle burst is at the
		// chaser cell where the contact happened.
		if (events.ok) {
			events.value.events.push({
				kind: "damage",
				target_id: player_id,
				x: cp.x,
				y: cp.y,
				damage: CONTACT_DAMAGE,
			});
		}
		w.despawn(chaser_id);
		if (next <= 0) {
			ctx.res.set(progress_r, { ...prog.value, dead: true });
			return;
		}
	}
};
