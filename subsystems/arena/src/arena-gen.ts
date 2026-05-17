import type { Ctx, System, World } from "@f0rbit/forge";
import { pos_c, rng as make_rng } from "@f0rbit/forge";
import { player_c, dummy_c, chaser_c, health_c, weapon_c, hitbox_c, vel_c, dir_vec_c } from "./components.ts";
import { arena_r, wave_r, hitstop_r, run_seed_r, hit_events_r, particles_r, camera_shake_r } from "./resources.ts";
import { g } from "./grid.ts";

const PLAYER_SPAWN_X = 160;
const PLAYER_SPAWN_Y = 90;
const DUMMY_SPAWN_X = 240;
const DUMMY_SPAWN_Y = 90;
const DESIGN_WIDTH = 320;
const DESIGN_HEIGHT = 180;
const PARTICLE_CAPACITY = 256;
const WAVE_SIZE = 5;
const PERIMETER_INSET = 4;
const PERIMETER_MAX_INSET = 12;
const CHASER_HITBOX_RADIUS = 4;

const reset_resources = (ctx: Ctx, base_seed: number, restart_count: number): void => {
	ctx.res.set(arena_r, {
		cols: g.cols,
		rows: g.rows,
		width: DESIGN_WIDTH,
		height: DESIGN_HEIGHT,
	});
	ctx.res.set(wave_r, { current: 1, total: 3, chasers_alive: 0 });
	ctx.res.set(hitstop_r, { remaining: 0 });
	ctx.res.set(camera_shake_r, { magnitude: 0, decay: 0 });
	ctx.res.set(run_seed_r, { base: base_seed, restart_count });
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
};

const spawn_player = (w: World): void => {
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
};

const spawn_dummy = (w: World): void => {
	w.spawn(
		[dummy_c, true],
		[pos_c, { x: DUMMY_SPAWN_X, y: DUMMY_SPAWN_Y }],
		[health_c, { current: 999, max: 999 }],
		[hitbox_c, { radius: 6 }],
	);
};

type Side = 0 | 1 | 2 | 3;

const perimeter_point = (rng_side: number, rng_along: number, rng_inset: number, width: number, height: number): { x: number; y: number } => {
	const side = Math.floor(rng_side * 4) as Side;
	const inset = PERIMETER_INSET + rng_inset * (PERIMETER_MAX_INSET - PERIMETER_INSET);
	if (side === 0) {
		return { x: rng_along * width, y: inset };
	}
	if (side === 1) {
		return { x: width - inset, y: rng_along * height };
	}
	if (side === 2) {
		return { x: rng_along * width, y: height - inset };
	}
	return { x: inset, y: rng_along * height };
};

export const spawn_wave = (w: World, ctx: Ctx, n: number): void => {
	const arena = ctx.res.get(arena_r);
	if (!arena.ok) return;
	const wave = ctx.res.get(wave_r);
	if (!wave.ok) return;
	const seed_res = ctx.res.get(run_seed_r);
	const base = seed_res.ok ? seed_res.value.base : ctx.rng.seed;
	const restart_count = seed_res.ok ? seed_res.value.restart_count : 0;
	const wave_rng = make_rng(base + restart_count * 1000 + wave.value.current);
	const { width, height } = arena.value;

	for (let i = 0; i < n; i++) {
		const p = perimeter_point(wave_rng.next(), wave_rng.next(), wave_rng.next(), width, height);
		w.spawn(
			[chaser_c, true],
			[pos_c, p],
			[vel_c, { x: 0, y: 0 }],
			[health_c, { current: 1, max: 1 }],
			[hitbox_c, { radius: CHASER_HITBOX_RADIUS }],
		);
	}

	wave.value.chasers_alive = n;
};

export const setup_arena = (w: World, ctx: Ctx): void => {
	const prev_seed = ctx.res.get(run_seed_r);
	const base = prev_seed.ok ? prev_seed.value.base : ctx.rng.seed;
	const restart_count = prev_seed.ok ? prev_seed.value.restart_count : 0;
	reset_resources(ctx, base, restart_count);
	spawn_player(w);
	spawn_dummy(w);
	spawn_wave(w, ctx, WAVE_SIZE);
};

export const make_arena_gen = (): System => (w, ctx) => {
	setup_arena(w, ctx);
};
