import { writeFileSync } from "node:fs";
import { harness, pos_c, replay } from "@f0rbit/forge";
import { game_bindings } from "../src/bindings.ts";
import { chaser_c, perks_c, player_c, xp_c } from "../src/components.ts";
import { g } from "../src/grid.ts";
import { game_plugin } from "../src/plugin.ts";
import { level_up_pending_r, progress_r } from "../src/resources.ts";

/**
 * Scripted-input recorder for the progress replay-as-test fixture
 * (Phase 5.6 — mirrors loot/tools/record-equip-and-stat.ts).
 *
 * Sequence at seed=1 (deterministic — enemy_spawn pool + RNG fork are
 * fixed-seeded; see arena-gen.ts + enemy-spawn.ts):
 *   1. boot tick — fires startup → arena_gen → spawn player at (10, 5).
 *   2. loop: drive the player toward the nearest chaser; when adjacent,
 *      face it (axis edge → dir_c) and emit a `swing` press the same tick.
 *      The melee_swing system kills the chaser; xp.ts grants 25 XP. After
 *      4 kills the player crosses xp_threshold(1) = 100 → level-up →
 *      progress_r.paused = true.
 *   3. on pause: emit `pick_perk_<idx>` for the corresponding choice and
 *      tick once; the synthetic-perk-pick bridge consumes it; perks_sys
 *      drains the queue and flips paused back to false.
 *   4. repeat: 4 more kills → level 3 → second pick; 12 more kills →
 *      level 4 → third pick.
 *   5. settle a few ticks after the final pick so dirty_stats clears.
 *
 * Perk-pick indices are chosen so the three applied perks are DISTINCT
 * — the deterministic shuffle at seed=1 always offers
 *   choices = ["perk.atk_plus", "perk.hp_plus", "perk.def_plus"]
 * — so picks [0, 1, 2] across three level-ups give exactly that set in
 * that order.
 *
 * Synthetic `pick_perk_0..2` bindings are mapped to Digit1..Digit3 in
 * bindings.ts; the recorder injects press/release edges so the replay
 * JSON survives without extending the replay schema (per AGENTS.md
 * "Synthetic action bindings for replay-recordable UI clicks").
 */

const SEED = 1;
const FIXED_DT = 1 / 60;
const SAFETY_CAP = 3000;
const SETTLE_TICKS = 30;

// Picks for level-up 1, 2, 3 — chosen to land DISTINCT perks given the
// deterministic shuffle (see record-level-and-save header).
const PERK_PICKS: readonly number[] = [0, 1, 2];

type Step = -1 | 0 | 1;

const sign = (n: number): Step => (n > 0 ? 1 : n < 0 ? -1 : 0);
const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
	Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

const h = harness({ seed: SEED, fixed_dt: FIXED_DT, bindings: game_bindings });
const recorder = replay.record(h.input, h.ctx, { seed: SEED });

game_plugin(h.world, h.schedule);

// Boot tick — fires the startup stage so the arena + player are spawned
// before the recorder injects any input. Mirrors loot's pattern.
h.time.advance(FIXED_DT);
h.schedule.tick(h.world, h.ctx);

let cur_dx: Step = 0;
let cur_dy: Step = 0;
let picks_made = 0;
let swing_held_until = -1;

const set_axis = (next_dx: Step, next_dy: Step): void => {
	if (next_dx !== cur_dx) {
		h.input.inject_actions([{ kind: "axis", action: "move.x", value: next_dx }]);
		cur_dx = next_dx;
	}
	if (next_dy !== cur_dy) {
		h.input.inject_actions([{ kind: "axis", action: "move.y", value: next_dy }]);
		cur_dy = next_dy;
	}
};

const player_cell = (): { x: number; y: number } | null => {
	for (const [, p] of h.world.query([player_c, pos_c] as const).collect()) {
		return g.world_to_cell(p.x, p.y);
	}
	return null;
};

const nearest_chaser_cell = (from: { x: number; y: number }): { x: number; y: number } | null => {
	let best: { x: number; y: number } | null = null;
	let best_d = Infinity;
	for (const [, p] of h.world.query([chaser_c, pos_c] as const).collect()) {
		const c = g.world_to_cell(p.x, p.y);
		const d = chebyshev(c, from);
		if (d < best_d) {
			best_d = d;
			best = c;
		}
	}
	return best;
};

for (let i = 0; i < SAFETY_CAP; i++) {
	const cell = player_cell();
	if (!cell) throw new Error(`player vanished at tick ${h.time.tick}`);

	const prog = h.res.get(progress_r);
	const lvl = h.res.get(level_up_pending_r);
	const paused = prog.ok && prog.value.paused && lvl.ok && lvl.value.pending;

	if (paused) {
		const pick_idx = PERK_PICKS[picks_made] ?? 0;
		const action = `pick_perk_${pick_idx}`;
		set_axis(0, 0);
		// Release any held swing before pressing pick so we don't queue a
		// stray melee on the unpause tick.
		h.input.inject_actions([{ kind: "release", action: "swing" }]);
		h.input.inject_actions([{ kind: "press", action }]);
		h.time.advance(FIXED_DT);
		h.schedule.tick(h.world, h.ctx);
		h.input.inject_actions([{ kind: "release", action }]);
		picks_made++;
		if (picks_made === PERK_PICKS.length) break;
		continue;
	}

	const target = nearest_chaser_cell(cell);
	if (target === null) {
		set_axis(0, 0);
	} else {
		const d = chebyshev(target, cell);
		if (d > 1) {
			set_axis(sign(target.x - cell.x), sign(target.y - cell.y));
		} else if (d === 0) {
			// Co-located with the chaser (chaser spawned on the player's cell).
			// Step into an interior cell so we can attack from adjacent. Bias
			// toward the player's existing facing if it's interior; otherwise
			// pick any cardinal that lands in the interior cell rect.
			//   interior: 1..cols-2, 1..rows-2
			const try_dirs: ReadonlyArray<[Step, Step]> = [
				[cur_dx as Step, cur_dy as Step],
				[1, 0], [-1, 0], [0, 1], [0, -1],
			];
			for (const [dx, dy] of try_dirs) {
				if (dx === 0 && dy === 0) continue;
				const nx = cell.x + dx;
				const ny = cell.y + dy;
				if (nx >= 1 && nx <= g.cols - 2 && ny >= 1 && ny <= g.rows - 2) {
					set_axis(dx, dy);
					break;
				}
			}
		} else {
			// Adjacent — face the chaser then swing on the same tick. dir_c is
			// set by input.ts from the axis edge, which fires before melee.
			set_axis(0, 0);
			const dx = sign(target.x - cell.x);
			const dy = sign(target.y - cell.y);
			h.input.inject_actions([{ kind: "axis", action: "move.x", value: dx }]);
			h.input.inject_actions([{ kind: "axis", action: "move.y", value: dy }]);
			cur_dx = dx;
			cur_dy = dy;
			h.input.inject_actions([{ kind: "press", action: "swing" }]);
			swing_held_until = h.time.tick + 1;
		}
	}

	h.time.advance(FIXED_DT);
	h.schedule.tick(h.world, h.ctx);

	if (h.time.tick > swing_held_until && swing_held_until >= 0) {
		h.input.inject_actions([{ kind: "release", action: "swing" }]);
		swing_held_until = -1;
	}
}

if (picks_made !== PERK_PICKS.length) {
	throw new Error(`recorder ran out of safety cap before all 3 picks (made ${picks_made})`);
}

set_axis(0, 0);
for (let i = 0; i < SETTLE_TICKS; i++) {
	h.time.advance(FIXED_DT);
	h.schedule.tick(h.world, h.ctx);
}

const final_xp = (() => {
	for (const [, xp] of h.world.query([player_c, xp_c] as const).collect()) return xp;
	return null;
})();
const final_perks = (() => {
	for (const [, p] of h.world.query([player_c, perks_c] as const).collect()) return p;
	return null;
})();

if (!final_xp || !final_perks) throw new Error("missing player state at end of recording");
if (final_xp.level !== 4) throw new Error(`expected level 4, got ${final_xp.level}`);
if (final_perks.applied.length !== 3) throw new Error(`expected 3 perks, got ${final_perks.applied.length}`);

const doc = recorder.stop();
const json = replay.save(doc);
const out_path = new URL("../replays/level-and-save.replay.json", import.meta.url).pathname;
writeFileSync(out_path, json + "\n");

console.log(
	`recorded ${doc.frames.length} frames; end tick ${h.time.tick}; final xp=${JSON.stringify(final_xp)}; perks=${JSON.stringify(final_perks.applied)} -> ${out_path}`,
);
