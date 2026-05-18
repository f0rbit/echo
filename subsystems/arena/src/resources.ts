import { resource, type ResKey, type Id } from "@f0rbit/forge";
import type { Fsm } from "./fsm.ts";

export type GameState = Fsm<"menu" | "playing" | "won" | "lost">;

export type Arena = {
	cols: number;
	rows: number;
	width: number;
	height: number;
};

export type CameraShake = {
	magnitude: number;
	decay: number;
};

export type ParticleEntry = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	ttl: number;
	max_ttl: number;
	color: number;
	size: number;
};

export type Particles = {
	entries: ParticleEntry[];
	head: number;
	capacity: number;
};

export type Hitstop = { remaining: number };

export type Wave = {
	current: number;
	total: number;
	chasers_alive: number;
	total_kills: number;
};

export type RunSeed = { base: number; restart_count: number };

export type HitEvent = {
	target_id: Id;
	x: number;
	y: number;
	damage: number;
};

export type HitEvents = { events: HitEvent[] };

export const arena_r: ResKey<Arena> = resource<Arena>("ar.arena");
export const camera_shake_r: ResKey<CameraShake> = resource<CameraShake>("ar.camera_shake");
export const particles_r: ResKey<Particles> = resource<Particles>("ar.particles");
export const hitstop_r: ResKey<Hitstop> = resource<Hitstop>("ar.hitstop");
export const wave_r: ResKey<Wave> = resource<Wave>("ar.wave");
export const run_seed_r: ResKey<RunSeed> = resource<RunSeed>("ar.run_seed");
export const hit_events_r: ResKey<HitEvents> = resource<HitEvents>("ar.hit_events");
export const game_state_r: ResKey<GameState> = resource<GameState>("ar.game_state");
