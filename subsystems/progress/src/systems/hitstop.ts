// FORGE-PROMOTION-CANDIDATE
//   Consumers: arena (subsystems/arena/src/systems/hitstop.ts),
//              progress (this file).
//   Planned promotion: Phase 8 `main` -> `@f0rbit/forge/fx/hitstop`.
//
// Cell-step progress copy of arena's hitstop trigger + release.
// Tick-count constant diverges: progress runs at cell-step cadence
// (player path-step is every 6 ticks; chasers think every 12, step
// every 6) so a 4-tick freeze is already a noticeable beat. We use a
// shorter `HITSTOP_TICKS` to keep the cell-step feel snappy — arena's
// continuous-motion combat benefits from a longer freeze; ours
// doesn't.
//
// Gate convention diverges from arena: progress reads
// `progress_r.paused || progress_r.dead`. The release system MUST NOT
// gate on hitstop itself per arena FRICTION §1 (commit 52ba5b6) —
// otherwise the countdown stalls and the freeze becomes permanent.
import type { System } from "@f0rbit/forge";
import { hit_events_r, hitstop_r, progress_r, type HitEventKind } from "../resources.ts";

// Per-kind hitstop tick counts. `swing` is skipped (no freeze on a
// press — only on impact). Kill and damage use distinct beats so the
// cell-step cadence reads each moment differently: a kill is a tighter
// hold (5 ticks ≈ 80ms — "thwack"); a damage is shorter (4 ticks ≈
// 60ms — quick punch communicating the hit without overshadowing the
// red flash). Mirrors the spec table in the bug-fix brief.
const HITSTOP_TICKS_BY_KIND: Readonly<Record<Exclude<HitEventKind, "swing">, number>> = {
	kill: 5,
	damage: 4,
};

/**
 * Trigger (update stage, AFTER combat systems): if any new hit events
 * arrived this tick and we're not already frozen, set remaining =
 * HITSTOP_TICKS. Does NOT touch `ctx.time.scale` — scale=0 would
 * deadlock `sch.tick` (no accumulator fill → release system never
 * runs → permanent freeze; see echo AGENTS.md "Game-state gates, NOT
 * time.scale = 0").
 */
export const make_hitstop_trigger_system = (): System => (_w, ctx) => {
	const prog = ctx.res.get(progress_r);
	if (prog.ok && (prog.value.paused || prog.value.dead)) return;

	const events = ctx.res.get(hit_events_r);
	if (!events.ok) return;
	if (events.value.events.length === 0) return;

	const hs = ctx.res.get(hitstop_r);
	if (!hs.ok) return;
	if (hs.value.remaining > 0) return;

	// Take the LONGEST hitstop among non-swing events this tick. A
	// simultaneous kill + damage tick (rare — would need a chaser
	// reaching player on the same tick as your swing lands another)
	// should hold for the loudest beat, not stack additively.
	let ticks = 0;
	for (const ev of events.value.events) {
		if (ev.kind === "swing") continue;
		ticks = Math.max(ticks, HITSTOP_TICKS_BY_KIND[ev.kind]);
	}
	if (ticks === 0) return;
	hs.value.remaining = ticks;
};

/**
 * Release (pre stage): decrement remaining each tick. MUST NOT gate
 * on hitstop itself — this is the system that has to keep running to
 * count down. Counterpart to the per-system early-returns in gameplay
 * systems.
 *
 * Does NOT gate on progress_r.paused/dead either — the countdown
 * should run even during a level-up pause (so unpausing doesn't
 * inherit a stale freeze) and trivially through death (so a kill on
 * the death-tick still resolves cleanly).
 */
export const make_hitstop_release_system = (): System => (_w, ctx) => {
	const hs = ctx.res.get(hitstop_r);
	if (!hs.ok) return;
	if (hs.value.remaining === 0) return;

	hs.value.remaining -= 1;
};
