// FORGE-PROMOTION-CANDIDATE
//   Consumers: arena (subsystems/arena/src/systems/flash.ts),
//              progress (this file).
//   Planned promotion: Phase 8 `main` -> `@f0rbit/forge/fx/flash`.
//
// Cell-step progress copy of arena's per-entity sprite-tint flash.
// Tint constant + tick count are module-local; the tick-count diverges
// from arena's 6 to give the cell-step cadence a beat-longer flash
// (chasers despawn instantly on kill, so the flash needs to be on the
// PLAYER, which doesn't move during a swing tick — see
// melee-swing.ts's hit-event target).
import type { System } from "@f0rbit/forge";
import { sprite_c, sprite } from "@f0rbit/forge/pixi";
import { flash_c } from "../components.ts";
import { hit_events_r, type HitEventKind } from "../resources.ts";

// Per-kind tint + tick tables (per AGENTS.md "Component-shape
// divergences resolve via module constants in the consumer"):
//
//   - swing  : cyan-white — brief swish indicator; the visible "you
//              pressed Z" signal even when no chaser is adjacent.
//   - kill   : white — punchy triumph; existing 9-tick beat.
//   - damage : red — longer than kill (12 ticks). Pain reads louder
//              than triumph; the longer beat communicates "you took a
//              hit" before the HP HUD even registers.
const FLASH_TINT_BY_KIND: Readonly<Record<HitEventKind, number>> = {
	swing: 0xa0e0ff,
	kill: 0xffffff,
	damage: 0xff4040,
};
const FLASH_TICKS_BY_KIND: Readonly<Record<HitEventKind, number>> = {
	swing: 6,
	kill: 9,
	damage: 12,
};

/**
 * Sprite flash — on hit events this tick, attach a `flash_c` to the
 * target if it has a sprite and isn't already flashing. Each tick:
 * decrement `ticks_remaining`; on the first tick of a flash set the
 * sprite tint to white; on expiry restore the original tint and remove
 * the `flash_c`.
 *
 * Targets without a `sprite_c` are skipped — the system is no-op-safe.
 * NOT gated on paused/dead: a tail-end flash should keep decaying
 * across a pause for visual smoothness, and a player flash fired by a
 * killing hit on the SAME tick `progress_r.dead` flips needs to play
 * out so the visual death is legible. The tail is cheap (one tint
 * write per flashing entity per tick).
 */
export const make_flash_system = (): System => (w, ctx) => {
	const events = ctx.res.get(hit_events_r);
	if (events.ok) {
		for (const ev of events.value.events) {
			const existing = w.get(ev.target_id, flash_c);
			if (existing.ok) continue;
			const sp = w.get(ev.target_id, sprite_c);
			if (!sp.ok) continue;
			const tint = FLASH_TINT_BY_KIND[ev.kind];
			const ticks = FLASH_TICKS_BY_KIND[ev.kind];
			const original_tint = sp.value.tint ?? tint;
			w.set(ev.target_id, flash_c, { ticks_remaining: ticks, original_tint });
			sprite.set(w, ev.target_id, { tint });
		}
	}

	for (const [id, f] of w.query([flash_c] as const).collect()) {
		const remaining = f.ticks_remaining - 1;
		if (remaining <= 0) {
			sprite.set(w, id, { tint: f.original_tint });
			w.remove(id, flash_c);
		} else {
			w.set(id, flash_c, { ticks_remaining: remaining, original_tint: f.original_tint });
		}
	}
};
