import { type System, type World, type Ctx, type Id, pos_c } from "@f0rbit/forge";
import {
	projectile_c,
	vel_c,
	hitbox_c,
	dummy_c,
	chaser_c,
	health_c,
} from "../components.ts";
import { arena_r, hit_events_r, hitstop_r } from "../resources.ts";

const PROJECTILE_SPEED = 64;
const PROJECTILE_RADIUS = 2;
const PROJECTILE_DAMAGE = 1;

export const spawn_projectile = (
	w: World,
	opts: { owner_id: Id; x: number; y: number; dx: number; dy: number },
): void => {
	const speed_x = opts.dx * PROJECTILE_SPEED;
	const speed_y = opts.dy * PROJECTILE_SPEED;
	w.spawn(
		[pos_c, { x: opts.x, y: opts.y }],
		[vel_c, { x: speed_x, y: speed_y }],
		[projectile_c, { owner_id: opts.owner_id, speed: PROJECTILE_SPEED, radius: PROJECTILE_RADIUS }],
		[hitbox_c, { radius: PROJECTILE_RADIUS }],
	);
};

export const make_combat_ranged_system = (): System => {
	return (w: World, ctx: Ctx) => {
		const hs = ctx.res.get(hitstop_r);
		if (hs.ok && hs.value.remaining > 0) return;

		const arena = ctx.res.get(arena_r);
		if (!arena.ok) return;

		const hit_events = ctx.res.get(hit_events_r);
		if (!hit_events.ok) return;

		const fixed_dt = ctx.time.fixed_dt;

		const projectiles = w.query([pos_c, vel_c, projectile_c, hitbox_c] as const).collect();
		const dummies = w.query([pos_c, hitbox_c, dummy_c] as const).collect();
		const chasers = w.query([pos_c, hitbox_c, chaser_c] as const).collect();
		const targets = [...dummies, ...chasers];

		for (const [proj_id, proj_pos, proj_vel, proj_data, proj_hitbox] of projectiles) {
			proj_pos.x += proj_vel.x * fixed_dt;
			proj_pos.y += proj_vel.y * fixed_dt;

			if (
				proj_pos.x < 0 ||
				proj_pos.x > arena.value.width ||
				proj_pos.y < 0 ||
				proj_pos.y > arena.value.height
			) {
				w.despawn(proj_id);
				continue;
			}

			let hit = false;
			for (const [target_id, target_pos, target_hitbox] of targets) {
				if (target_id === proj_data.owner_id) continue;

				const dx = target_pos.x - proj_pos.x;
				const dy = target_pos.y - proj_pos.y;
				const dist_sq = dx * dx + dy * dy;
				const radius_sum = proj_hitbox.radius + target_hitbox.radius;
				const radius_sum_sq = radius_sum * radius_sum;

				if (dist_sq <= radius_sum_sq) {
					const target_health = w.get(target_id, health_c);
					if (target_health.ok) {
						target_health.value.current -= PROJECTILE_DAMAGE;
					}

					hit_events.value.events.push({
						target_id,
						x: proj_pos.x,
						y: proj_pos.y,
						damage: PROJECTILE_DAMAGE,
					});

					hit = true;
					break;
				}
			}

			if (hit) {
				w.despawn(proj_id);
			}
		}
	};
};
