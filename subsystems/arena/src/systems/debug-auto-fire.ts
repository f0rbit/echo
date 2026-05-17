import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { player_c, dir_vec_c, weapon_c, swing_c, lifetime_c } from "../components.ts";
import { hitstop_r } from "../resources.ts";
import { spawn_projectile } from "./combat-ranged.ts";

const MELEE_INTERVAL = 60;
const RANGED_INTERVAL = 90;
const MELEE_ARC_RADIANS = Math.PI / 2;
const MELEE_RADIUS = 12;

// Sequential target positions — player rotates facing through these so each
// auto-fire lands on a different dummy. Order matches debug-plugin spawn order.
const TARGETS: ReadonlyArray<{ x: number; y: number }> = [
	{ x: 80, y: 60 },
	{ x: 160, y: 60 },
	{ x: 240, y: 60 },
];

const face_target = (px: number, py: number, target_idx: number): { x: number; y: number } => {
	const t = TARGETS[target_idx % TARGETS.length]!;
	const dx = t.x - px;
	const dy = t.y - py;
	const mag = Math.hypot(dx, dy);
	if (mag < 0.001) return { x: 1, y: 0 };
	return { x: dx / mag, y: dy / mag };
};

/**
 * Debug auto-fire — drives melee + ranged on a deterministic tick schedule so
 * the debug fixture exercises hitstop + camera shake + flash + particles +
 * light-fx without any human input. Mirrors the spawn logic in `input.ts` but
 * triggered by `ctx.time.tick` modulo (not key press).
 *
 * Gated on hitstop like real input — the freeze should affect auto-fires the
 * same way it affects player input.
 *
 * Player facing rotates sequentially through 3 target dummies (debug-plugin
 * places them at the TARGETS positions above) so each effect lands on a fresh
 * target.
 */
export const make_debug_auto_fire_system = (): System => (w, ctx) => {
	const hs = ctx.res.get(hitstop_r);
	if (hs.ok && hs.value.remaining > 0) return;

	const tick = ctx.time.tick;
	const fire_melee = tick > 0 && tick % MELEE_INTERVAL === 0;
	const fire_ranged = tick > 0 && tick % RANGED_INTERVAL === 0;
	if (!fire_melee && !fire_ranged) return;

	for (const [id, pos, , wc] of w.query([player_c, pos_c, dir_vec_c, weapon_c] as const).collect()) {
		const melee_idx = Math.floor(tick / MELEE_INTERVAL) % TARGETS.length;
		const ranged_idx = Math.floor(tick / RANGED_INTERVAL) % TARGETS.length;
		const aim_idx = fire_melee ? melee_idx : ranged_idx;
		const dir = face_target(pos.x, pos.y, aim_idx);
		w.set(id, dir_vec_c, dir);

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
