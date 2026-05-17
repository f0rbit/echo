import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { player_c, dummy_c, health_c, weapon_c, hitbox_c, vel_c, dir_vec_c } from "./components.ts";
import { arena_r, wave_r, hitstop_r, run_seed_r, hit_events_r, particles_r, camera_shake_r } from "./resources.ts";
import { g } from "./grid.ts";

const PLAYER_SPAWN_X = 160;
const PLAYER_SPAWN_Y = 90;
const DUMMY_SPAWN_X = 240;
const DUMMY_SPAWN_Y = 90;
const DESIGN_WIDTH = 320;
const DESIGN_HEIGHT = 180;
const PARTICLE_CAPACITY = 256;

export const make_arena_gen = (): System => (w, ctx) => {
	const arena = {
		cols: g.cols,
		rows: g.rows,
		width: DESIGN_WIDTH,
		height: DESIGN_HEIGHT,
	};

	ctx.res.set(arena_r, arena);
	ctx.res.set(wave_r, { current: 1, total: 3, chasers_alive: 0 });
	ctx.res.set(hitstop_r, { remaining: 0 });
	ctx.res.set(camera_shake_r, { magnitude: 0, decay: 0 });
	ctx.res.set(run_seed_r, { base: 1, restart_count: 0 });
	ctx.res.set(hit_events_r, { events: [] });
	ctx.res.set(particles_r, {
		entries: Array.from({ length: PARTICLE_CAPACITY }, () => ({
			x: 0,
			y: 0,
			vx: 0,
			vy: 0,
			ttl: 0,
			max_ttl: 0,
			color: 0,
			size: 0,
		})),
		head: 0,
		capacity: PARTICLE_CAPACITY,
	});

	// dir_vec_c doubles as facing — initialized to {1,0} so the first
	// melee/ranged input has a direction even before any movement.
	w.spawn(
		[player_c, true],
		[pos_c, { x: PLAYER_SPAWN_X, y: PLAYER_SPAWN_Y }],
		[dir_vec_c, { x: 1, y: 0 }],
		[vel_c, { x: 0, y: 0 }],
		[health_c, { current: 3, max: 3 }],
		[weapon_c, {
			melee_cooldown: 20,
			ranged_cooldown: 12,
			melee_ready_in: 0,
			ranged_ready_in: 0,
		}],
		[hitbox_c, { radius: 4 }],
	);

	w.spawn(
		[dummy_c, true],
		[pos_c, { x: DUMMY_SPAWN_X, y: DUMMY_SPAWN_Y }],
		[health_c, { current: 999, max: 999 }],
		[hitbox_c, { radius: 6 }],
	);

	// Note: Background rect is render-only; defer to plugin/main wiring.
	// Note: Chasers are spawned by Phase 3.3, not this phase.
};
