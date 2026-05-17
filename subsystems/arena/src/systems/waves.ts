import type { Ctx, System, World } from "@f0rbit/forge";
import { chaser_c, health_c } from "../components.ts";
import { hitstop_r, wave_r } from "../resources.ts";
import { spawn_wave } from "../arena-gen.ts";

const WAVE_SIZE = 5;

/**
 * Wave manager — runs after enemy-ai in the update stage so contact-damage
 * despawns are reflected before the wave-clear check.
 *
 * Each tick:
 *  1. Reap dead chasers (health <= 0) — combat-melee / combat-ranged decrement
 *     health but don't despawn; this is the kill-event equivalent.
 *  2. If wave_r.chasers_alive === 0:
 *       - if wave_r.current >= wave_r.total: win condition, do nothing further.
 *       - else: increment wave_r.current and spawn the next wave around the
 *         arena perimeter.
 *
 * Win signal: chasers_alive === 0 AND current === total. Game-over polling is
 * the consumer's responsibility (HUD / restart prompt).
 *
 * Future work (OQ-A4): chaser speed scales per wave. Out of scope for v1.
 */

const reap_dead_chasers = (w: World, ctx: Ctx): void => {
	const wave = ctx.res.get(wave_r);
	if (!wave.ok) return;
	for (const [id, h] of w.query([chaser_c, health_c] as const).collect()) {
		if (h.current <= 0) {
			w.despawn(id);
			wave.value.chasers_alive = Math.max(0, wave.value.chasers_alive - 1);
			wave.value.total_kills += 1;
		}
	}
};

const advance_wave = (w: World, ctx: Ctx): void => {
	const wave = ctx.res.get(wave_r);
	if (!wave.ok) return;
	if (wave.value.chasers_alive > 0) return;
	if (wave.value.current >= wave.value.total) return;
	wave.value.current += 1;
	spawn_wave(w, ctx, WAVE_SIZE);
};

export const make_waves_system = (): System => (w, ctx) => {
	const hs = ctx.res.get(hitstop_r);
	if (hs.ok && hs.value.remaining > 0) return;

	reap_dead_chasers(w, ctx);
	advance_wave(w, ctx);
};
