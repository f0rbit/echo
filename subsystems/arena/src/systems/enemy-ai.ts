import { pos_c, type System } from "@f0rbit/forge";
import { chaser_c, player_c, vel_c, health_c, hitbox_c } from "../components.ts";
import { game_state_r, hit_events_r, hitstop_r, wave_r } from "../resources.ts";

const CHASER_SPEED = 30; // pixels per second
const CHASER_DAMAGE = 1;
const EPS_SQ = 1e-6;

/**
 * Chaser AI — continuous-motion gradient toward player.
 *
 * Each tick:
 *  - Sets each chaser's vel_c to a unit vector toward the player scaled by
 *    CHASER_SPEED. Position integration is handled by the generalised
 *    movement system, which integrates any [pos_c, vel_c] entity.
 *  - On circle-vs-circle overlap with the player, despawns the chaser
 *    (sacrifice-on-contact), decrements player health, emits a hit event,
 *    and decrements wave_r.chasers_alive.
 *
 * Player death is not handled here — game-over flows from health_c.current
 * reaching 0; restart.ts handles the reset.
 */

export const make_enemy_ai_system = (): System => (w, ctx) => {
	const gs = ctx.res.get(game_state_r);
	if (gs.ok && gs.value.state !== "playing") return;

	const hs = ctx.res.get(hitstop_r);
	if (hs.ok && hs.value.remaining > 0) return;

	const hit_events = ctx.res.get(hit_events_r);
	if (!hit_events.ok) return;
	const wave = ctx.res.get(wave_r);
	if (!wave.ok) return;

	const players = w.query([player_c, pos_c, hitbox_c, health_c] as const).collect();
	if (players.length === 0) return;
	const [player_id, player_pos, player_hitbox, player_health] = players[0]!;

	const chasers = w.query([chaser_c, pos_c, vel_c, hitbox_c] as const).collect();
	for (const [chaser_id, chaser_pos, , chaser_hitbox] of chasers) {
		const dx = player_pos.x - chaser_pos.x;
		const dy = player_pos.y - chaser_pos.y;
		const dist_sq = dx * dx + dy * dy;

		const contact_radius = chaser_hitbox.radius + player_hitbox.radius;
		if (dist_sq <= contact_radius * contact_radius) {
			player_health.current -= CHASER_DAMAGE;
			hit_events.value.events.push({
				target_id: player_id,
				x: player_pos.x,
				y: player_pos.y,
				damage: CHASER_DAMAGE,
			});
			w.despawn(chaser_id);
			wave.value.chasers_alive = Math.max(0, wave.value.chasers_alive - 1);
			continue;
		}

		if (dist_sq < EPS_SQ) {
			w.set(chaser_id, vel_c, { x: 0, y: 0 });
			continue;
		}

		const dist = Math.sqrt(dist_sq);
		w.set(chaser_id, vel_c, {
			x: (dx / dist) * CHASER_SPEED,
			y: (dy / dist) * CHASER_SPEED,
		});
	}
};
