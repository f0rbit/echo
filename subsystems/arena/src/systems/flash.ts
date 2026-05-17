import type { System } from "@f0rbit/forge";
import { sprite_c, sprite } from "@f0rbit/forge/pixi";
import { flash_c } from "../components.ts";
import { hit_events_r } from "../resources.ts";

const FLASH_TICKS = 6;
const FLASH_TINT = 0xffffff;

/**
 * Sprite flash — on hit events this tick, attach a `flash_c` to the target if
 * it has a sprite and isn't already flashing. Each tick: decrement
 * `ticks_remaining`; on the first tick of a flash set the sprite tint to
 * white; on expiry restore the original tint and remove the `flash_c`.
 *
 * Targets without a `sprite_c` are skipped — the system is no-op-safe before
 * Phase 3.6 adds sprite-attach to the arena.
 */
export const make_flash_system = (): System => (w, ctx) => {
	const events = ctx.res.get(hit_events_r);
	if (events.ok) {
		for (const ev of events.value.events) {
			const existing = w.get(ev.target_id, flash_c);
			if (existing.ok) continue;
			const sp = w.get(ev.target_id, sprite_c);
			if (!sp.ok) continue;
			const original_tint = sp.value.tint ?? FLASH_TINT;
			w.set(ev.target_id, flash_c, { ticks_remaining: FLASH_TICKS, original_tint });
			sprite.set(w, ev.target_id, { tint: FLASH_TINT });
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
