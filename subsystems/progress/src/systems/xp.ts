// xp.ts — drains queued xp_gain events, applies xp_gain_mul from stats_c,
// and fires the level-up state machine (set paused + populate 3 perk
// choices). Closure-local queue per AGENTS.md "Transient state in factory
// closures, not resources."
//
// Multi-level-up policy (per .plans/progress.md §2 Q4):
//   At most ONE level-up per system tick. Excess XP sits in xp_c.current
//   and re-triggers the next tick. This is intentional — pause-and-pick
//   means there can only be one outstanding pause at a time; the player
//   must pick before another level-up can fire. melee-swing (Phase 5.3) is
//   gated on `progress_r.paused`, so no new xp_gain events arrive while
//   the pick is pending.
//
// This system does NOT gate on `progress_r.paused`. The xp_gain events
// emitted on the SAME tick that triggers a level-up still need to be
// drained on that tick (melee-swing emits BEFORE this system runs). Once
// paused is set, melee stops emitting; the queue stays empty until perks.ts
// clears the pause. So skipping the gate is safe AND necessary.
import type { Ctx, Id, System, World } from "@f0rbit/forge";
import { perks_c, player_c, stats_c, xp_c } from "../components.ts";
import { level_up_pending_r, perk_registry_r, progress_r } from "../resources.ts";
import { PERKS, xp_threshold, type PerkDef, type PerkRegistry } from "../data/perks.ts";

export const XP_BASE_PER_KILL = 25;

export type XpSystem = {
	system: System;
	emit_xp_gain: (amount: number) => void;
};

const find_player = (w: World): Id | null => {
	const players = w.query([player_c, xp_c] as const).collect();
	const first = players[0];
	if (!first) return null;
	return first[0];
};

const pick_perk_choices = (registry: PerkRegistry, applied: readonly string[], ctx: Ctx): string[] => {
	const pool: PerkDef[] = Array.from(registry.perks.values());
	if (pool.length === 0) return [];
	const sub_rng = ctx.rng.fork("progress.level_up");
	// Fisher–Yates shuffle on a copy of the pool, then take up to 3 ids.
	const copy = pool.slice();
	for (let i = copy.length - 1; i > 0; i--) {
		const j = sub_rng.int(0, i);
		const tmp = copy[i]!;
		copy[i] = copy[j]!;
		copy[j] = tmp;
	}
	void applied; // stacking policy enforcement is deferred to a richer
	// "only offer perks where player has <3 stacks" pass (plan §2 Q6).
	return copy.slice(0, Math.min(3, copy.length)).map((d) => d.id as string);
};

export const make_xp_system = (): XpSystem => {
	let pending: number[] = [];

	const system: System = (w, ctx) => {
		if (pending.length === 0) return;
		const drained = pending;
		pending = [];
		const player_id = find_player(w);
		if (player_id === null) return;

		const stats = w.get(player_id, stats_c);
		const xp = w.get(player_id, xp_c);
		if (!stats.ok || !xp.ok) return;

		const mul = 1 + stats.value.xp_gain_mul;
		const total_raw = drained.reduce((acc, n) => acc + n, 0);
		const gained = Math.floor(total_raw * mul);
		let current = xp.value.current + gained;
		let level = xp.value.level;

		// One level-up per tick; overflow re-triggers next tick.
		const threshold = xp_threshold(level);
		if (threshold > 0 && current >= threshold) {
			current -= threshold;
			level += 1;

			const prog = ctx.res.get(progress_r);
			const reg = ctx.res.get(perk_registry_r);
			if (prog.ok && reg.ok) {
				const registry = reg.value as unknown as PerkRegistry;
				const perks_now = w.get(player_id, perks_c);
				const applied = perks_now.ok ? perks_now.value.applied : [];
				const choices = pick_perk_choices(registry.perks.size > 0 ? registry : { perks: new Map(PERKS.map((d) => [d.id, d])) }, applied, ctx);
				ctx.res.set(progress_r, { ...prog.value, paused: true });
				ctx.res.set(level_up_pending_r, { pending: true, choices });
			}
		}

		w.set(player_id, xp_c, { current, level });
	};

	const emit_xp_gain = (amount: number): void => {
		pending.push(amount);
	};

	return { system, emit_xp_gain };
};
