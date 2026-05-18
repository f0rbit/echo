import type { Ctx, System } from "@f0rbit/forge";
import type { Graphics } from "pixi.js";
import { game_state_r, particles_r, hit_events_r, hitstop_r, type Particles } from "../resources.ts";

const PARTICLES_PER_HIT = 12;
const PARTICLE_SPEED_MIN = 20;
const PARTICLE_SPEED_MAX = 60;
const PARTICLE_TTL_TICKS = 24;
const PARTICLE_COLOR = 0xffaa44;
const PARTICLE_SIZE = 1;

/**
 * Ring-buffer particle system. `particles_r.entries` is a fixed-capacity array
 * (256 by default); `head` wraps when emit pushes past capacity.
 *
 * Three systems:
 *  - emit (update): on each hit event, write PARTICLES_PER_HIT entries with
 *    seeded jitter. Overwrites stale entries when full.
 *  - advance (update): integrate position by velocity * fixed_dt; decrement
 *    ttl. Pure data — no rendering.
 *  - render (post): draw entries with `ttl > 0` to a Graphics overlay added to
 *    `app.render.world` in main.ts. Fade alpha by `ttl / max_ttl`.
 */

const wrap_write = (p: Particles, entry: Particles["entries"][number]): void => {
	const slot = p.entries[p.head];
	if (slot) {
		slot.x = entry.x;
		slot.y = entry.y;
		slot.vx = entry.vx;
		slot.vy = entry.vy;
		slot.ttl = entry.ttl;
		slot.max_ttl = entry.max_ttl;
		slot.color = entry.color;
		slot.size = entry.size;
	} else {
		p.entries[p.head] = { ...entry };
	}
	p.head = (p.head + 1) % p.capacity;
};

export const emit_burst = (
	p: Particles,
	x: number,
	y: number,
	count: number,
	rand: () => number,
	opts: { color?: number; size?: number; ttl?: number; speed_min?: number; speed_max?: number } = {},
): void => {
	const color = opts.color ?? PARTICLE_COLOR;
	const size = opts.size ?? PARTICLE_SIZE;
	const ttl = opts.ttl ?? PARTICLE_TTL_TICKS;
	const sp_min = opts.speed_min ?? PARTICLE_SPEED_MIN;
	const sp_max = opts.speed_max ?? PARTICLE_SPEED_MAX;
	for (let i = 0; i < count; i++) {
		const angle = rand() * Math.PI * 2;
		const speed = sp_min + rand() * (sp_max - sp_min);
		wrap_write(p, {
			x,
			y,
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed,
			ttl,
			max_ttl: ttl,
			color,
			size,
		});
	}
};

export const advance_particles = (p: Particles, dt: number): void => {
	for (const e of p.entries) {
		if (e.ttl <= 0) continue;
		e.x += e.vx * dt;
		e.y += e.vy * dt;
		e.ttl -= 1;
	}
};

// Emit is NOT gated on hitstop: hits and particle emission happen on the same
// tick that hitstop_trigger sets remaining=4 (trigger runs at update phase 7,
// emit at phase 9). Gating here would mean particles never emit for a kill
// burst, because hit_events_r is cleared in pre at the start of the next tick
// (before hitstop releases). `particles_advance` IS gated so emitted particles
// freeze in place during the 4-tick hitstop "punch" — that's the visual stop.
export const make_particles_emit_system = (): System => (_w, ctx) => {
	const gs = ctx.res.get(game_state_r);
	if (gs.ok && gs.value.state !== "playing") return;

	const p = ctx.res.get(particles_r);
	if (!p.ok) return;
	const events = ctx.res.get(hit_events_r);
	if (!events.ok || events.value.events.length === 0) return;
	const rand = (): number => ctx.rng.next();
	for (const ev of events.value.events) {
		emit_burst(p.value, ev.x, ev.y, PARTICLES_PER_HIT, rand);
	}
};

export const make_particles_advance_system = (): System => (_w, ctx: Ctx) => {
	const gs = ctx.res.get(game_state_r);
	if (gs.ok && gs.value.state !== "playing") return;
	const hs = ctx.res.get(hitstop_r);
	if (hs.ok && hs.value.remaining > 0) return;
	const p = ctx.res.get(particles_r);
	if (!p.ok) return;
	advance_particles(p.value, 1);
};

export const make_particles_render_system = (overlay: Graphics): System =>
	(_w, ctx) => {
		const p = ctx.res.get(particles_r);
		if (!p.ok) return;
		overlay.clear();
		for (const e of p.value.entries) {
			if (e.ttl <= 0) continue;
			const alpha = e.max_ttl > 0 ? e.ttl / e.max_ttl : 0;
			overlay.rect(e.x - e.size / 2, e.y - e.size / 2, e.size, e.size).fill({ color: e.color, alpha });
		}
	};
