// perks.ts — drains queued perk-pick events, applies the picked perk to
// `perks_c.applied`, and clears the level-up pause. Closure-local queue
// (AGENTS.md "Transient state in factory closures, not resources").
//
// Gating: the system only does work when `progress_r.paused === true` AND
// `level_up_pending_r.pending === true`. Calls to queue_perk_pick outside
// that window are silently no-ops. Per .plans/progress.md §2 Q4.
//
// Stacking: v1 appends unconditionally. The "cap at 3 stacks per perk"
// rule (plan §2 Q6 line 167) is deferred to the perk-choice generator —
// the picker should simply stop offering perks the player already has 3
// of. Easier to enforce at offer time than at pick time.
//
// Heal-on-pick hook: per .plans/progress.md §2 Q6 line 159, `perk.hp_plus`
// also bumps `hp_c.current` by the same amount as the max_hp delta. The
// hook is generalised: any perk whose `modifier.hp` is positive bumps
// current by that amount. Future heal-on-pick perks can use the same path
// by setting `modifier.hp` (or layering an explicit `heal` modifier when
// the time comes).
import type { Ctx, Id, System, World } from "@f0rbit/forge";
import { hp_c, perks_c, player_c } from "../components.ts";
import { level_up_pending_r, perk_registry_r, progress_r } from "../resources.ts";
import type { PerkDef, PerkId, PerkRegistry } from "../data/perks.ts";

export type PerksSystem = {
	system: System;
	queue_perk_pick: (idx: number) => void;
};

const find_player = (w: World): Id | null => {
	const players = w.query([player_c, perks_c] as const).collect();
	const first = players[0];
	if (!first) return null;
	return first[0];
};

const apply_heal_hook = (w: World, player_id: Id, def: PerkDef): void => {
	const hp_delta = def.modifier.hp ?? 0;
	if (hp_delta <= 0) return;
	const hp = w.get(player_id, hp_c);
	if (!hp.ok) return;
	w.set(player_id, hp_c, { ...hp.value, current: hp.value.current + hp_delta });
};

const apply_pick = (w: World, ctx: Ctx, player_id: Id, idx: number): boolean => {
	const lvl = ctx.res.get(level_up_pending_r);
	if (!lvl.ok) return false;
	if (idx < 0 || idx >= lvl.value.choices.length) return false;
	const perk_id = lvl.value.choices[idx]!;

	const reg = ctx.res.get(perk_registry_r);
	if (!reg.ok) return false;
	const registry = reg.value as unknown as PerkRegistry;
	const def = registry.perks.get(perk_id as PerkId) ?? null;

	const perks = w.get(player_id, perks_c);
	if (!perks.ok) return false;
	w.set(player_id, perks_c, { applied: [...perks.value.applied, perk_id] });

	if (def !== null) apply_heal_hook(w, player_id, def);
	return true;
};

export const make_perks_system = (): PerksSystem => {
	let pending: number[] = [];

	const system: System = (w, ctx) => {
		if (pending.length === 0) return;
		const prog = ctx.res.get(progress_r);
		const lvl = ctx.res.get(level_up_pending_r);
		if (!prog.ok || !lvl.ok) return;
		if (!prog.value.paused || !lvl.value.pending) return;

		const drained = pending;
		pending = [];
		const player_id = find_player(w);
		if (player_id === null) return;

		let any_applied = false;
		for (const idx of drained) {
			if (apply_pick(w, ctx, player_id, idx)) any_applied = true;
		}

		if (any_applied) {
			ctx.res.set(progress_r, { ...prog.value, paused: false, dirty_stats: true });
			ctx.res.set(level_up_pending_r, { pending: false, choices: [] });
		}
	};

	const queue_perk_pick = (idx: number): void => {
		pending.push(idx);
	};

	return { system, queue_perk_pick };
};
