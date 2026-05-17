import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import type { LightHandle, LightSystem } from "@f0rbit/forge/light";
import { g } from "../grid.ts";
import { player_c, swing_c } from "../components.ts";
import { hit_events_r } from "../resources.ts";

const SCREEN_FLASH_TICKS = 8;
const SCREEN_FLASH_RADIUS = 32;
const SCREEN_FLASH_PEAK = 1.0;
const SCREEN_FLASH_FALLOFF = 0.5;
const SCREEN_FLASH_COLOR: readonly [number, number, number] = [1, 1, 1];

const HIT_GLOW_TICKS = 12;
const HIT_GLOW_RADIUS = 3;
const HIT_GLOW_PEAK = 0.9;
const HIT_GLOW_FALLOFF = 1.4;
const HIT_GLOW_COLOR: readonly [number, number, number] = [1, 0.45, 0.15];

type ActiveScreenFlash = {
	handle: LightHandle;
	ticks_remaining: number;
};

type ActiveHitGlow = {
	handle: LightHandle;
	ticks_remaining: number;
};

/**
 * Light-driven feedback FX — screen flash (melee swing) + per-hit glow.
 *
 * Uses `@f0rbit/forge/light` `LightHandle`s. main.ts installs the lighting
 * filter on `app.render.world` with `ambient = (1,1,1)` so the filter is
 * visually transparent when no game lights are active. Both effects ramp
 * intensity to zero over a fixed tick count and then `ls.remove()`.
 *
 * Replay determinism preserved: handles are added/removed in tick-deterministic
 * game systems; the light system's per-tick recompute is a pure function of
 * (handle set, tick, seed).
 */
export const make_light_fx_system = (ls: LightSystem): System => {
	let screen_flash: ActiveScreenFlash | null = null;
	const hit_glows: ActiveHitGlow[] = [];

	return (w, ctx) => {
		const swings = w.query([player_c, pos_c, swing_c] as const).collect();
		if (swings.length > 0 && !screen_flash) {
			const player = w.query([player_c, pos_c] as const).collect()[0];
			const cell = player ? g.world_to_cell(player[1].x, player[1].y) : { x: 0, y: 0 };
			const handle = ls.add({
				pos_cell: [cell.x, cell.y],
				color: SCREEN_FLASH_COLOR,
				radius_cells: SCREEN_FLASH_RADIUS,
				intensity: SCREEN_FLASH_PEAK,
				falloff: SCREEN_FLASH_FALLOFF,
			});
			screen_flash = { handle, ticks_remaining: SCREEN_FLASH_TICKS };
		}

		const events = ctx.res.get(hit_events_r);
		if (events.ok) {
			for (const ev of events.value.events) {
				const cell = g.world_to_cell(ev.x, ev.y);
				const handle = ls.add({
					pos_cell: [cell.x, cell.y],
					color: HIT_GLOW_COLOR,
					radius_cells: HIT_GLOW_RADIUS,
					intensity: HIT_GLOW_PEAK,
					falloff: HIT_GLOW_FALLOFF,
				});
				hit_glows.push({ handle, ticks_remaining: HIT_GLOW_TICKS });
			}
		}

		if (screen_flash) {
			screen_flash.ticks_remaining -= 1;
			if (screen_flash.ticks_remaining <= 0) {
				ls.remove(screen_flash.handle);
				screen_flash = null;
			} else {
				const t = screen_flash.ticks_remaining / SCREEN_FLASH_TICKS;
				ls.set_intensity(screen_flash.handle, SCREEN_FLASH_PEAK * t);
			}
		}

		for (let i = hit_glows.length - 1; i >= 0; i--) {
			const glow = hit_glows[i]!;
			glow.ticks_remaining -= 1;
			if (glow.ticks_remaining <= 0) {
				ls.remove(glow.handle);
				hit_glows.splice(i, 1);
			} else {
				const t = glow.ticks_remaining / HIT_GLOW_TICKS;
				ls.set_intensity(glow.handle, HIT_GLOW_PEAK * t);
			}
		}
	};
};
