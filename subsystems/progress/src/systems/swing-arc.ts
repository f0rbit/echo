// swing-arc.ts — render-stage Graphics overlay drawn while the melee
// swing window is active (`tick < swing_state_r.active_until_tick`).
// Visible cyan-white arc in front of the player, rotated by `dir_c`'s
// heading, fades out as the window expires.
//
// PURPOSE — the cyan player-flash + cyan tint on swing reads as a
// subtle blink at best. Player feedback: "im still not seeing any
// sprite/animation for attacks". A drawn arc in the swing direction is
// the unambiguous "the swing is happening, in THIS direction" cue.
//
// PARENT CONTAINER — caller passes a Graphics added to `app.render.world`
// so the arc lives in the world-coord space alongside the player + chasers
// (lighting filter applies; the arc dims in shadowed areas, like every
// other gameplay-readable element).
//
// Z-ORDER — `graphics.zIndex` is set to 4 by the caller (above the
// player's z=3, below particles' z=100). `app.render.world.sortableChildren
// = true` (already set in main.ts).
//
// DETERMINISM — no rng, no resource writes; pure read of player pos +
// dir_c + swing_state_r. No effect on the world hash.

import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import type { Graphics } from "pixi.js";
import { dir_c, player_c } from "../components.ts";
import { g } from "../grid.ts";
import { swing_state_r } from "../resources.ts";
import { SWING_WINDOW_TICKS } from "./melee-swing.ts";

// Arc geometry — design coords (16px tile). Reach is ~1.5 tiles so the
// arc visibly extends past the adjacent cell where the kill lands.
const ARC_REACH = g.tile * 1.5;
const ARC_INNER = g.tile * 0.35;
const ARC_HALF_ANGLE = Math.PI / 4; // 90° total spread

const ARC_COLOR = 0xa0e0ff;
const ARC_EDGE_COLOR = 0xffffff;

// Map dir_c → angle in radians (0 = +x). Defaults to right-facing if
// somehow dir_c is { 0, 0 } (boot-frame; player hasn't pressed yet).
const dir_to_angle = (dx: number, dy: number): number => {
	if (dx === 0 && dy === 0) return 0;
	return Math.atan2(dy, dx);
};

export const make_swing_arc_system = (overlay: Graphics): System => (w, ctx) => {
	overlay.clear();

	const ss = ctx.res.get(swing_state_r);
	if (!ss.ok) return;
	const active_until = ss.value.active_until_tick;
	const tick = ctx.time.tick;
	if (tick >= active_until) return;

	const players = w.query([player_c, pos_c, dir_c] as const).collect();
	const first = players[0];
	if (!first) return;
	const [, p, d] = first;

	// Fade by remaining-window ratio. SWING_WINDOW_TICKS is the spawn
	// width of the window; `remaining / SWING_WINDOW_TICKS` is in (0, 1].
	const remaining = active_until - tick;
	const ratio = Math.max(0, Math.min(1, remaining / SWING_WINDOW_TICKS));
	const alpha = 0.35 + 0.55 * ratio;

	const angle = dir_to_angle(d.dx, d.dy);
	const start = angle - ARC_HALF_ANGLE;
	const end = angle + ARC_HALF_ANGLE;

	// Wedge: arc out from the player at radius ARC_REACH, then back at
	// ARC_INNER so the visible shape is a fan in the facing direction.
	overlay.moveTo(p.x + Math.cos(start) * ARC_INNER, p.y + Math.sin(start) * ARC_INNER);
	overlay.arc(p.x, p.y, ARC_REACH, start, end, false);
	overlay.arc(p.x, p.y, ARC_INNER, end, start, true);
	overlay.closePath();
	overlay.fill({ color: ARC_COLOR, alpha: alpha * 0.55 });
	overlay.stroke({ color: ARC_EDGE_COLOR, width: 1, alpha });
};
