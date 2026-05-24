// FORGE-PROMOTION-CANDIDATE
//   Consumers: arena (subsystems/arena/src/systems/camera-shake.ts),
//              progress (this file).
//   Planned promotion: Phase 8 `main` -> `@f0rbit/forge/fx/camera-shake`.
//
// Cell-step progress copy diverges from arena only in the gameplay
// gate: progress reads `progress_r.paused || progress_r.dead` instead
// of arena's `game_state_r.state !== "playing"`. Magnitude / decay /
// stop-threshold constants are module-local per AGENTS.md "Component-
// shape divergences resolve via module constants in the consumer".
import type { System } from "@f0rbit/forge";
import { rng as make_rng } from "@f0rbit/forge";
import type { RenderState } from "@f0rbit/forge/pixi";
import { camera_shake_r, hit_events_r, progress_r, type HitEventKind } from "../resources.ts";

// Per-kind shake magnitudes. `swing` is skipped (no shake on a press —
// only the flash communicates the input edge). `damage` shakes harder
// than `kill` because being hit reads as a louder world-event than
// landing a hit. Magnitudes stay clamped to MAX_MAGNITUDE downstream.
//
// REGRESSION FIX (kill 2→3, damage 4→5): the prior values produced
// peak jitter of ±2px / ±4px against a 16px tile, which read as "no
// shake" to the user. Arena's flat HIT_MAGNITUDE_PUSH=3 was the
// visually-tuned baseline; the per-kind variant must stay above that
// for kill (the most-common event) to feel right. damage stays
// stronger than kill per the original design intent.
const HIT_MAGNITUDE_BY_KIND: Readonly<Record<Exclude<HitEventKind, "swing">, number>> = {
	kill: 3,
	damage: 5,
};
const MAX_MAGNITUDE = 6;
const DECAY = 0.85;
const STOP_THRESHOLD = 0.01;

/**
 * Camera shake — render-stage system; runs AFTER `forge.render`.
 *
 * On any hit event this tick, push HIT_MAGNITUDE_PUSH into
 * `camera_shake_r.magnitude` (clamped to MAX_MAGNITUDE). Each render
 * tick: sample seeded jitter `(rng.next()*2 - 1) * magnitude` for
 * dx/dy, call `render.set_screen_offset(dx, dy)`, then decay
 * `magnitude *= DECAY`. Below STOP_THRESHOLD: zero the offset and skip.
 *
 * Replay determinism: this is render-only mutation of
 * `surface_sprite.position` (via forge v0.5+'s `set_screen_offset`).
 * The world hash never observes the offset. RNG is forked from
 * `ctx.time.tick` so the jitter is deterministic.
 */

/**
 * Hit-magnitude push. Runs in the `update` stage after combat systems
 * so any hit events for this tick contribute before the render-stage
 * `apply` step. Gated on the paused/dead state so a hit emitted on the
 * same tick a level-up pause begins doesn't shake into the modal.
 */
export const make_camera_shake_push_system = (): System => (_w, ctx) => {
	const prog = ctx.res.get(progress_r);
	if (prog.ok && (prog.value.paused || prog.value.dead)) return;

	const shake = ctx.res.get(camera_shake_r);
	if (!shake.ok) return;
	const events = ctx.res.get(hit_events_r);
	if (!events.ok || events.value.events.length === 0) return;

	let push = 0;
	for (const ev of events.value.events) {
		if (ev.kind === "swing") continue;
		push += HIT_MAGNITUDE_BY_KIND[ev.kind];
	}
	if (push === 0) return;
	const next_mag = shake.value.magnitude + push;
	shake.value.magnitude = Math.min(MAX_MAGNITUDE, next_mag);
	shake.value.decay = DECAY;
};

/**
 * Render-stage apply step. Mutates `surface_sprite.position` via
 * `render.set_screen_offset` and decays. main.ts wires this with the
 * boot's `app.render` reference and registers it on `"render"` stage
 * AFTER `forge.render`.
 *
 * NOT gated on the paused/dead state: the decay tail must keep running
 * after a kill that fires hitstop + level-up — otherwise a residual
 * shake locks in until the next un-paused tick.
 */
export const make_camera_shake_apply_system = (render: RenderState): System =>
	(_w, ctx) => {
		const shake = ctx.res.get(camera_shake_r);
		if (!shake.ok) return;

		if (shake.value.magnitude < STOP_THRESHOLD) {
			shake.value.magnitude = 0;
			render.set_screen_offset(0, 0);
			return;
		}

		const r = make_rng(ctx.time.tick);
		const dx = (r.next() * 2 - 1) * shake.value.magnitude;
		const dy = (r.next() * 2 - 1) * shake.value.magnitude;
		render.set_screen_offset(dx, dy);

		const decay = shake.value.decay || DECAY;
		shake.value.magnitude *= decay;
	};
