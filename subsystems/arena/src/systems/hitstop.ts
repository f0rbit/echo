import type { System } from "@f0rbit/forge";
import { hit_events_r, hitstop_r } from "../resources.ts";

const HITSTOP_TICKS = 4;

/**
 * Hitstop — `time.scale = 0` for HITSTOP_TICKS sim ticks on any hit event.
 *
 * Trigger (update stage, AFTER combat systems): if any new hit_events and
 * we're not already frozen, set scale = 0 and remaining = HITSTOP_TICKS.
 *
 * Release (pre stage): decrement remaining; when it hits 0, restore scale = 1.
 *
 * Visible consequence: `sch.tick` doesn't run while scale = 0, so the render
 * stage is also frozen — the canvas holds the last rendered frame for the
 * duration. That IS the hitstop effect (see .plans/arena.md §2 Q2).
 */
export const make_hitstop_trigger_system = (): System => (_w, ctx) => {
	const events = ctx.res.get(hit_events_r);
	if (!events.ok) return;
	if (events.value.events.length === 0) return;

	const hs = ctx.res.get(hitstop_r);
	if (!hs.ok) return;
	if (hs.value.remaining > 0) return;

	hs.value.remaining = HITSTOP_TICKS;
	ctx.time.scale = 0;
};

export const make_hitstop_release_system = (): System => (_w, ctx) => {
	const hs = ctx.res.get(hitstop_r);
	if (!hs.ok) return;
	if (hs.value.remaining === 0) return;

	hs.value.remaining -= 1;
	if (hs.value.remaining === 0) {
		ctx.time.scale = 1;
	}
};
