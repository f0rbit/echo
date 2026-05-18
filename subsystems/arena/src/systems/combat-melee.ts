import { type System, type World, type Ctx, pos_c } from "@f0rbit/forge";
import { chaser_c, dummy_c, swing_c, lifetime_c, hitbox_c, health_c } from "../components.ts";
import { game_state_r, hit_events_r, hitstop_r } from "../resources.ts";

/**
 * Melee combat system for arena.
 *
 * `swing_c` entities are spawned by `input.ts` with a 1-tick `lifetime_c`. This
 * system only handles hit detection and event emission; the movement system
 * decrements lifetimes and despawns expired swings.
 *
 * Hit detection: for each swing, arc-vs-circle vs every target (chaser + dummy).
 * Multiple targets per swing are allowed — the arc is "wide" not "single-shot".
 * On hit: decrement health, emit to `hit_events_r`.
 */

const wrap_pi = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export const make_combat_melee_system = (): System =>
	(w: World, ctx: Ctx) => {
		const gs = ctx.res.get(game_state_r);
		if (gs.ok && gs.value.state !== "playing") return;

		const hs = ctx.res.get(hitstop_r);
		if (hs.ok && hs.value.remaining > 0) return;

		const hit_events = ctx.res.get(hit_events_r);
		if (!hit_events.ok) return;

		const swings = w.query([pos_c, swing_c, lifetime_c] as const).collect();
		const chasers = w.query([pos_c, hitbox_c, chaser_c] as const).collect();
		const dummies = w.query([pos_c, hitbox_c, dummy_c] as const).collect();
		const targets = [...chasers, ...dummies];

		for (const [, swing_pos, swing_data] of swings) {
			const swing_angle = Math.atan2(swing_data.dir.y, swing_data.dir.x);
			const arc_half = swing_data.arc_radians / 2;

			for (const [target_id, target_pos, target_hitbox] of targets) {
				const dx = target_pos.x - swing_pos.x;
				const dy = target_pos.y - swing_pos.y;
				const dist_sq = dx * dx + dy * dy;
				const max_dist = swing_data.radius + target_hitbox.radius;
				if (dist_sq > max_dist * max_dist) continue;

				const angle_to_target = Math.atan2(dy, dx);
				const delta = wrap_pi(angle_to_target - swing_angle);
				if (Math.abs(delta) > arc_half) continue;

				const health = w.get(target_id, health_c);
				if (health.ok) {
					health.value.current -= 1;
				}

				hit_events.value.events.push({
					target_id,
					x: target_pos.x,
					y: target_pos.y,
					damage: 1,
				});
			}
		}
	};
