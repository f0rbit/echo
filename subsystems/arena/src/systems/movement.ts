import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { player_c, vel_c, weapon_c, lifetime_c, swing_c, projectile_c } from "../components.ts";
import { arena_r, game_state_r, hitstop_r } from "../resources.ts";
import { g } from "../grid.ts";

/**
 * Continuous-motion integration over any `[pos_c, vel_c]` entity.
 *
 * `vel_c` is in pixels-per-second. Input system multiplies player axis input
 * by PLAYER_SPEED before writing; enemy-ai sets chaser vel from a normalized
 * heading × CHASER_SPEED; projectiles set their own vel directly.
 *
 * Projectiles are excluded — combat-ranged integrates them itself so it can
 * test for boundary-despawn and per-tick hit detection in one pass.
 *
 * Wall collision: the player gets an interior clamp to [tile, width-tile] ×
 * [tile, height-tile] so they can't walk onto perimeter wall cells. Chasers
 * and the dummy are NOT clamped — chasers spawn near the perimeter (PERIMETER_INSET
 * 4..12 px) and chase the player inwards, so their positions track the player.
 * Re-clamping them would shift their pixel positions one tile inward + drift
 * the recorded replay hash for no gameplay win (they're already pursuing the
 * player into the interior).
 */

export const make_movement_system = (): System => (w, ctx) => {
	const gs = ctx.res.get(game_state_r);
	if (gs.ok && gs.value.state !== "playing") return;

	const hs = ctx.res.get(hitstop_r);
	if (hs.ok && hs.value.remaining > 0) return;

	const arena = ctx.res.get(arena_r);
	if (!arena.ok) return;

	const { width, height } = arena.value;
	const dt = ctx.time.fixed_dt;
	const tile = g.tile;
	const min_x = tile;
	const max_x = width - tile;
	const min_y = tile;
	const max_y = height - tile;

	for (const [id, pos, vel] of w.query([pos_c, vel_c] as const, { without: [projectile_c] }).collect()) {
		const new_x = pos.x + vel.x * dt;
		const new_y = pos.y + vel.y * dt;
		// Players clamp to the interior cell rect (wall perimeter blocked); other
		// motion entities (chasers, dummy) use full canvas bounds so their pixel
		// positions don't shift one tile inward.
		const is_player = w.has(id, player_c);
		const lo_x = is_player ? min_x : 0;
		const hi_x = is_player ? max_x : width;
		const lo_y = is_player ? min_y : 0;
		const hi_y = is_player ? max_y : height;
		w.set(id, pos_c, {
			x: Math.max(lo_x, Math.min(new_x, hi_x)),
			y: Math.max(lo_y, Math.min(new_y, hi_y)),
		});
	}

	// Decrement weapon cooldowns each tick.
	for (const [id, wc] of w.query([player_c, weapon_c] as const).collect()) {
		w.set(id, weapon_c, {
			...wc,
			melee_ready_in: Math.max(0, wc.melee_ready_in - 1),
			ranged_ready_in: Math.max(0, wc.ranged_ready_in - 1),
		});
	}

	// Tick lifetime_c entities (swing arcs) — despawn at 0.
	for (const [id, lt] of w.query([lifetime_c, swing_c] as const).collect()) {
		const remaining = lt.ticks_remaining - 1;
		if (remaining <= 0) {
			w.despawn(id);
		} else {
			w.set(id, lifetime_c, { ticks_remaining: remaining });
		}
	}
};
