import { resource, type ResKey, type Id } from "@f0rbit/forge";

export type Arena = {
	cols: number;
	rows: number;
	width: number;
	height: number;
};

// Camera shake — render-only mutation of `surface_sprite.position` via
// forge's `render.set_screen_offset`. NOT snapshotted — visuals only,
// world-hash never observes the offset. Mirrors arena's resource.
export type CameraShake = {
	magnitude: number;
	decay: number;
};

// Ring-buffer particle pool. Capacity is fixed at boot. NOT snapshotted
// — render-only juice (particles re-emit naturally on the next hit
// event after restore). Mirrors arena's resource.
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

// Hitstop gate — `remaining > 0` freezes gameplay systems for that many
// ticks. Snapshotted per arena's pattern: the freeze is gameplay-visible
// (affects tick→frame timing) so it must survive restore. Decremented
// by the `pre`-stage release system, which MUST NOT gate on itself
// (echo AGENTS.md "Game-state gates, NOT time.scale = 0").
export type Hitstop = { remaining: number };

// Per-tick hit events drained by flash, hitstop, shake, particles.
// Cleared in `pre` stage so each tick's events are fresh. NOT
// snapshotted — transient by contract.
//
// `kind` discriminator routes per-event fx so the three combat moments
// read distinctly:
//   - "swing"  : Z pressed (with or without a victim) — cyan player
//                flash only; NO particles / shake / hitstop.
//   - "kill"   : melee landed a kill — white player flash + yellow
//                particle burst at the victim cell + low-mag shake +
//                short hitstop. Existing pre-fix behaviour.
//   - "damage" : contact-damage from a chaser closing on the player —
//                RED player flash (longer than kill — pain reads louder
//                than triumph) + smaller red particle burst + medium-mag
//                shake + short hitstop.
// Each fx system filters by kind via module-local constant tables (per
// AGENTS.md "Component-shape divergences resolve via module constants
// in the consumer").
export type HitEventKind = "swing" | "kill" | "damage";
export type HitEvent = {
	kind: HitEventKind;
	target_id: Id;
	x: number;
	y: number;
	damage: number;
};
export type HitEvents = { events: HitEvent[] };

export type RunSeed = { base: number; restart_count: number };

// Loose typing for now; Phase 5.1 introduces PerkDef + the concrete
// registry shape via Zod schemas.
// NOT snapshotted — static config, rehydrated by setup_progress.
export type PerkRegistry = {
	perks: Map<string, unknown>;
};

// Mirrors bestiary's CreatureOccupancy: per-tick set of occupied cell keys
// (encoded ints). Rebuilt each tick by the occupancy system (Phase 5.3).
export type CreatureOccupancy = { cells: ReadonlySet<number> };

// Mirrors bestiary's WallIndex. progress has no walls in v1 — the set stays
// empty — but the resource exists so copied chaser/path-step systems compile
// unchanged.
export type WallIndex = { cells: ReadonlySet<number> };

// Game-state gate (per AGENTS.md "Game-state gates, NOT time.scale = 0"):
//   paused — true while level_up_pending_r.pending is true; gameplay systems
//            early-return; the perk-pick consumer is the sole release path.
//   dirty_stats — set when perks change; consumed by stats-recompute system.
//   dead — set by contact-damage when player hp hits 0; gameplay systems
//          gate on `paused || dead`. Cleared by restart.ts.
export type Progress = { paused: boolean; dirty_stats: boolean; dead: boolean };

// Level-up gate: 3 perk ids drawn when XP threshold crosses. The pick-perk
// systems (Phase 5.4) drain `choices` and clear `pending`.
export type LevelUpPending = { pending: boolean; choices: readonly string[] };

// Melee swing window — a Z press queues a swing "active for the next N
// ticks". Any chaser that enters chebyshev-1 range during the window dies
// and clears the window (one kill per swing). Without the window, the
// edge-only `just("swing")` had to land within the same tick the chaser
// became adjacent — but contact-damage despawns the chaser on that same
// tick (sacrifice-on-contact), so the player-perceived window was
// effectively 0. See FRICTION.md "Edge-triggered melee vs. sacrifice-on-
// contact contact-damage".
//
// `active_until_tick` is exclusive-end (swing is active while
// `tick < active_until_tick`). `0` = no swing queued.
export type SwingState = { active_until_tick: number };

export const arena_r: ResKey<Arena> = resource<Arena>("pr.arena");
export const run_seed_r: ResKey<RunSeed> = resource<RunSeed>("pr.run_seed");
export const perk_registry_r: ResKey<PerkRegistry> = resource<PerkRegistry>("pr.perk_registry");
export const creature_occupancy_r: ResKey<CreatureOccupancy> = resource<CreatureOccupancy>("pr.creature_occupancy");
export const wall_index_r: ResKey<WallIndex> = resource<WallIndex>("pr.wall_index");
export const progress_r: ResKey<Progress> = resource<Progress>("pr.progress");
export const level_up_pending_r: ResKey<LevelUpPending> = resource<LevelUpPending>("pr.level_up_pending");
export const swing_state_r: ResKey<SwingState> = resource<SwingState>("pr.swing_state");
export const camera_shake_r: ResKey<CameraShake> = resource<CameraShake>("pr.camera_shake");
export const particles_r: ResKey<Particles> = resource<Particles>("pr.particles");
export const hitstop_r: ResKey<Hitstop> = resource<Hitstop>("pr.hitstop");
export const hit_events_r: ResKey<HitEvents> = resource<HitEvents>("pr.hit_events");
