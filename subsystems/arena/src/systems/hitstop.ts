import type { System } from "@f0rbit/forge";
import { hit_events_r, hitstop_r } from "../resources.ts";

const HITSTOP_TICKS = 4;

// Hitstop = game-state gate. Gameplay systems early-return while hitstop_r.remaining > 0. See .plans/arena.md §2 Q2.

/**
 * Trigger (update stage, AFTER combat systems): if any new hit_events and
 * we're not already frozen, set remaining = HITSTOP_TICKS. Does NOT touch
 * `ctx.time.scale` — scale=0 would deadlock `sch.tick` (no accumulator fill
 * → release system never runs → permanent freeze).
 */
export const make_hitstop_trigger_system = (): System => (_w, ctx) => {
	const events = ctx.res.get(hit_events_r);
	if (!events.ok) return;
	if (events.value.events.length === 0) return;

	const hs = ctx.res.get(hitstop_r);
	if (!hs.ok) return;
	if (hs.value.remaining > 0) return;

	hs.value.remaining = HITSTOP_TICKS;
};

/**
 * Release (pre stage): decrement remaining each tick. Must NOT gate on
 * hitstop itself — this is the system that has to keep running to count
 * down. Counterpart to the per-system early-returns in gameplay systems.
 */
export const make_hitstop_release_system = (): System => (_w, ctx) => {
	const hs = ctx.res.get(hitstop_r);
	if (!hs.ok) return;
	if (hs.value.remaining === 0) return;

	hs.value.remaining -= 1;
};
