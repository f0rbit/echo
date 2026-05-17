import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { player_c, vel_c, weapon_c, lifetime_c, swing_c, projectile_c } from "../components.ts";
import { arena_r, hitstop_r } from "../resources.ts";

/**
 * Continuous-motion integration over any `[pos_c, vel_c]` entity.
 *
 * `vel_c` is in pixels-per-second. Input system multiplies player axis input
 * by PLAYER_SPEED before writing; enemy-ai sets chaser vel from a normalized
 * heading × CHASER_SPEED; projectiles set their own vel directly.
 *
 * Projectiles are excluded — combat-ranged integrates them itself so it can
 * test for boundary-despawn and per-tick hit detection in one pass.
 */

export const make_movement_system = (): System => (w, ctx) => {
	const hs = ctx.res.get(hitstop_r);
	if (hs.ok && hs.value.remaining > 0) return;

	const arena = ctx.res.get(arena_r);
	if (!arena.ok) return;

	const { width, height } = arena.value;
	const dt = ctx.time.fixed_dt;

	for (const [id, pos, vel] of w.query([pos_c, vel_c] as const, { without: [projectile_c] }).collect()) {
		const new_x = pos.x + vel.x * dt;
		const new_y = pos.y + vel.y * dt;
		w.set(id, pos_c, {
			x: Math.max(0, Math.min(new_x, width)),
			y: Math.max(0, Math.min(new_y, height)),
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
