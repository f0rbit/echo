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
 *   2. loop: drive the player toward the nearest chaser. The recorder
 *      observes state ONE tick behind (recorder iter → inject input →
 *      schedule.tick fires), so it must PRE-EMPT contact damage: the
 *      moment a chaser is at chebyshev ≤ 2, face it and press swing on
 *      the same iteration. By the time path-step runs the chaser will
 *      have closed to d=1; the same-tick melee_swing then kills it
 *      BEFORE the phase-6.5 contact_damage system sees it. If the
 *      recorder waits for d===1 it observes too late — contact damage
 *      will have already fired on the tick the chaser closed.
 *      melee_swing kills the chaser; xp.ts grants 25 XP.
 *   3. on pause (xp_threshold crossed): emit `pick_perk_<idx>` for the
 *      corresponding choice; the synthetic-perk-pick bridge consumes
 *      it; perks_sys drains the queue and flips paused back to false.
 *   4. loop ends early when progress_r.dead is true OR all PERK_PICKS
 *      consumed. The player CAN die before the third pick — when
 *      multiple chasers flank the recorder's greedy nearest-target
 *      strategy, contact damage drains HP faster than melee kills can
 *      level up. The replay artefact then captures a partial run; the
 *      replay tests assert whatever final state the recorder achieves
 *      (see test/replay.test.ts EXPECTED_FINAL_*).
 *   5. settle a few ticks at the end so dirty_stats clears.
 *
 * Perk-pick indices are chosen so the picks land DISTINCT perks given
 * the deterministic shuffle at seed=1.
 *
 * `just("swing")` is an edge — fires only on the false→true transition
 * computed in input.refresh(). Holding `press` across iters keeps the
 * override true and the edge fires only once. The recorder alternates
 * release/press in swing_phase so every other engagement iter
 * generates a real edge.
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
// swing phase: alternates 'release' → 'press' so `just("swing")` actually
// fires an edge each press iter. `just()` is computed from prev/cur in
// the same `refresh()` call (see forge/input refresh), so the override
// must transition false→true through TWO refreshes (one with the
// release applied, one with the press applied). Holding press across
// iters keeps overrides_pressed=true and the press edge fires only once.
let swing_phase: "press" | "release" = "press";

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

let dead_at_tick: number | null = null;
for (let i = 0; i < SAFETY_CAP; i++) {
	const cell = player_cell();
	if (!cell) throw new Error(`player vanished at tick ${h.time.tick}`);

	const prog = h.res.get(progress_r);
	const lvl = h.res.get(level_up_pending_r);
	if (prog.ok && prog.value.dead) {
		dead_at_tick = h.time.tick;
		break;
	}
	const paused = prog.ok && prog.value.paused && lvl.ok && lvl.value.pending;

	if (paused) {
		const pick_idx = PERK_PICKS[picks_made] ?? 0;
		const action = `pick_perk_${pick_idx}`;
		set_axis(0, 0);
		// Release any held swing before pressing pick so we don't queue a
		// stray melee on the unpause tick.
		h.input.inject_actions([{ kind: "release", action: "swing" }]);
		swing_phase = "press";
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
		if (d > 2) {
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
			// d ∈ {1, 2} — pre-empt contact damage. Face the chaser; alternate
			// release/press across iters so `just("swing")` fires a fresh
			// edge each press iter (see `swing_phase` declaration).
			//
			// Player facing must be set whether or not this is a press iter
			// — melee_swing reads `dir_c` (set by input from move.x/move.y
			// edges) and `pos_c`, so facing has to be current on every
			// release iter too in case the chaser jumps adjacency during
			// the gap.
			set_axis(0, 0);
			const dx = sign(target.x - cell.x);
			const dy = sign(target.y - cell.y);
			h.input.inject_actions([{ kind: "axis", action: "move.x", value: dx }]);
			h.input.inject_actions([{ kind: "axis", action: "move.y", value: dy }]);
			cur_dx = dx;
			cur_dy = dy;
			if (swing_phase === "press") {
				h.input.inject_actions([{ kind: "press", action: "swing" }]);
				swing_phase = "release";
			} else {
				h.input.inject_actions([{ kind: "release", action: "swing" }]);
				swing_phase = "press";
			}
		}
	}

	h.time.advance(FIXED_DT);
	h.schedule.tick(h.world, h.ctx);
}

set_axis(0, 0);
h.input.inject_actions([{ kind: "release", action: "swing" }]);
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

const doc = recorder.stop();
const json = replay.save(doc);
const out_path = new URL("../replays/level-and-save.replay.json", import.meta.url).pathname;
writeFileSync(out_path, json + "\n");

console.log(
	`recorded ${doc.frames.length} frames; end tick ${h.time.tick}; picks_made=${picks_made}; dead_at_tick=${dead_at_tick}; final xp=${JSON.stringify(final_xp)}; perks=${JSON.stringify(final_perks.applied)} -> ${out_path}`,
);
