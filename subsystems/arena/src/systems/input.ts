import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { player_c, dir_vec_c, vel_c, weapon_c, swing_c, lifetime_c } from "../components.ts";
import { spawn_projectile } from "./combat-ranged.ts";

const MELEE_ARC_RADIANS = Math.PI / 2; // 90°
const MELEE_RADIUS = 12;
const PLAYER_SPEED = 80; // pixels per second

/**
 * Input system for arena.
 *
 * Movement: digital/analog "move.x"/"move.y" → normalized into `vel_c` on the
 * player (consumed by movement system to integrate position).
 *
 * Facing convention: `dir_vec_c` doubles as "last non-zero input" and is only
 * overwritten when the input vector is non-zero — so melee/ranged fire always
 * has a valid heading even when the player is standing still. arena-gen seeds
 * the initial facing as {1, 0} so the very first shot has a direction.
 *
 * Fire: Z (melee) spawns a swing_c entity with 1-tick lifetime; X (ranged)
 * calls spawn_projectile. Both gated by weapon_c cooldown counters which the
 * movement system decrements each tick.
 */

export const make_input_system = (): System => (w, ctx) => {
	const [ax, ay] = ctx.input.vector("move.x", "move.y");
	const mag = Math.hypot(ax, ay);
	const has_input = mag > 0.1;
	const nx = has_input ? ax / mag : 0;
	const ny = has_input ? ay / mag : 0;

	for (const [id] of w.query([player_c, vel_c] as const).collect()) {
		w.set(id, vel_c, { x: nx * PLAYER_SPEED, y: ny * PLAYER_SPEED });
	}

	if (has_input) {
		for (const [id] of w.query([player_c, dir_vec_c] as const).collect()) {
			w.set(id, dir_vec_c, { x: nx, y: ny });
		}
	}

	const fire_melee = ctx.input.just("melee");
	const fire_ranged = ctx.input.just("ranged");
	if (!fire_melee && !fire_ranged) return;

	for (const [id, pos, dir, wc] of w.query([player_c, pos_c, dir_vec_c, weapon_c] as const).collect()) {
		if (fire_melee && wc.melee_ready_in === 0) {
			w.spawn(
				[pos_c, { x: pos.x, y: pos.y }],
				[swing_c, { owner_id: id, dir: { x: dir.x, y: dir.y }, arc_radians: MELEE_ARC_RADIANS, radius: MELEE_RADIUS }],
				[lifetime_c, { ticks_remaining: 1 }],
			);
			w.set(id, weapon_c, { ...wc, melee_ready_in: wc.melee_cooldown });
		}
		if (fire_ranged && wc.ranged_ready_in === 0) {
			spawn_projectile(w, { owner_id: id, x: pos.x, y: pos.y, dx: dir.x, dy: dir.y });
			w.set(id, weapon_c, { ...wc, ranged_ready_in: wc.ranged_cooldown });
		}
	}
};
