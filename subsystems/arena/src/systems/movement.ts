import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { player_c, vel_c, weapon_c, lifetime_c, swing_c } from "../components.ts";
import { arena_r } from "../resources.ts";

const PLAYER_SPEED = 80; // pixels per second

export const make_movement_system = (): System => (w, ctx) => {
	const arena = ctx.res.get(arena_r);
	if (!arena.ok) return;

	const { width, height } = arena.value;
	const dt = ctx.time.fixed_dt;

	// Integrate player position from vel_c (zero when no input).
	for (const [id, pos, vel] of w.query([player_c, pos_c, vel_c] as const).collect()) {
		const new_x = pos.x + vel.x * PLAYER_SPEED * dt;
		const new_y = pos.y + vel.y * PLAYER_SPEED * dt;
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
