// melee-swing.ts — Z press queues a swing window; any chaser entering
// chebyshev-1 range during the window dies. Per .plans/progress.md §2 Q2:
// 1-tile melee, instant kill, XP per kill (XP_BASE_PER_KILL = 25).
//
// Why a window (not edge-triggered):
//   contact-damage.ts is sacrifice-on-contact — the moment a chaser
//   reaches chebyshev-1, it despawns the chaser AND costs the player 1
//   HP, every tick. Before the window existed, melee_swing fired only on
//   the `just("swing")` edge — a 1-tick (~16ms) opportunity to land a
//   kill on the same tick the chaser closed. In practice every chaser
//   died to contact-damage (suicide-bomber feel); Z-press appeared to do
//   nothing because the press always landed BEFORE the chaser was
//   adjacent (wasted) or AFTER (already despawned). See FRICTION.md
//   "Edge-triggered melee vs. sacrifice-on-contact contact-damage".
//
// New behaviour:
//   - On `just("swing")`: set `swing_state_r.active_until_tick =
//     tick + SWING_WINDOW_TICKS`. Forgiving anticipation window — press
//     Z when a chaser is approaching and the swing will land.
//   - Every tick (gameplay-gates permitting): if `tick <
//     active_until_tick`, find any chebyshev-1 chaser; if found, kill it
//     + emit XP + reset `active_until_tick = 0` (one kill per swing —
//     pressing Z is the player input, not an AoE pulse).
//   - Window naturally expires when `tick >= active_until_tick`.
//
// Adjacency is chebyshev-1 (8-neighbour ring, identical to
// contact-damage.ts). Rationale: path-step's `blocked_by` set includes
// the player cell so a chaser can never sit on it — direction-cast melee
// at `player + dir_c` misses if `dir_c == {0, 0}`. Direction-agnostic
// adjacency mirrors contact-damage's pattern so "any chaser that can hurt
// you, you can hit back".
//
// First-found chaser at chebyshev distance ≤ 1 dies. Iteration order is
// query-emission order (entity-id-stable) so replays remain deterministic.
//
// Gated on `progress_r.paused || progress_r.dead` per §2 Q4. The window
// state must NOT advance during pause; queueing a swing during a level-up
// modal would be surprising. The xp_sys.emit_xp_gain closure call must
// run BEFORE the xp system in the schedule so the kill's XP is consumed
// on the same tick it was queued.
//
// `swing_state_r` is snapshotted (see snapshot.ts) so the window survives
// mid-replay restore + disk save/load.
import type { Id, System, World } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { chaser_c, player_c } from "../components.ts";
import { g } from "../grid.ts";
import { hit_events_r, hitstop_r, progress_r, swing_state_r } from "../resources.ts";
import { XP_BASE_PER_KILL, type XpSystem } from "./xp.ts";

const MELEE_RANGE = 1;
// ~250ms at 60Hz — feels like a real swing arc. Long enough to be
// forgiving against the cell-step chaser cadence (chasers path-step
// every 6 ticks, so SWING_WINDOW_TICKS = 15 spans 2-3 chaser steps);
// short enough that holding Z is no different from tapping.
export const SWING_WINDOW_TICKS = 15;

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
	const hs = ctx.res.get(hitstop_r);
	if (hs.ok && hs.value.remaining > 0) return;

	const tick = ctx.time.tick;
	const ss = ctx.res.get(swing_state_r);
	let active_until = ss.ok ? ss.value.active_until_tick : 0;

	const just_swung = ctx.input.just("swing");
	if (just_swung) active_until = tick + SWING_WINDOW_TICKS;

	const players = w.query([player_c, pos_c] as const).collect();
	const first = players[0];

	// Emit a `swing` hit_event on the press edge regardless of victim —
	// the cyan player flash is the visible swing indicator. Without
	// this, pressing Z with no adjacent chaser produced zero visual
	// feedback and the window felt invisible. The flash system only
	// branches on `kind`; particles / shake / hitstop skip "swing".
	if (just_swung && first) {
		const events = ctx.res.get(hit_events_r);
		if (events.ok) {
			const [player_id, player_pos] = first;
			events.value.events.push({
				kind: "swing",
				target_id: player_id,
				x: player_pos.x,
				y: player_pos.y,
				damage: 0,
			});
		}
	}

	if (tick >= active_until) {
		if (ss.ok && ss.value.active_until_tick !== active_until) {
			ctx.res.set(swing_state_r, { active_until_tick: active_until });
		}
		return;
	}

	if (!first) {
		ctx.res.set(swing_state_r, { active_until_tick: active_until });
		return;
	}
	const [, player_pos] = first;
	const player_cell = g.world_to_cell(player_pos.x, player_pos.y);

	const victim = find_adjacent_chaser(w, player_cell);
	if (victim === null) {
		ctx.res.set(swing_state_r, { active_until_tick: active_until });
		return;
	}
	// Emit `kill` hit_event on the PLAYER (not the victim) so the flash
	// system tints the player white. The victim is despawned the same
	// tick, so flashing them would render as a single-frame blink —
	// pointless. Particles + shake + hitstop read hit_events_r too; the
	// (x, y) is the victim cell so particles burst at the kill site.
	const victim_pos = w.get(victim, pos_c);
	const events = ctx.res.get(hit_events_r);
	if (events.ok && victim_pos.ok) {
		const first_player = first;
		events.value.events.push({
			kind: "kill",
			target_id: first_player[0],
			x: victim_pos.value.x,
			y: victim_pos.value.y,
			damage: 1,
		});
	}
	w.despawn(victim);
	xp_sys.emit_xp_gain(XP_BASE_PER_KILL);
	// Consume the window — one kill per Z press. Player must re-press to
	// chain a second kill on the next adjacent chaser.
	ctx.res.set(swing_state_r, { active_until_tick: 0 });
};
