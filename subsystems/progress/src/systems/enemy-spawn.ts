// enemy-spawn.ts — spawn one chaser every SPAWN_EVERY ticks, capped at
// MAX_CHASERS simultaneous alive chasers. Spawn cells are picked
// (seeded) from a fixed pool of 8 perimeter cells. Per
// .plans/progress.md §2 Q5 lines 136–146.
//
// Gated on `progress_r.paused` per §2 Q4 — no new chasers during the
// level-up pause.
//
// Seeded selection: the RNG is RE-forked every tick (only when a spawn
// would actually fire, to keep `ctx.rng` un-advanced on idle ticks) via
// `ctx.rng.fork("progress.spawn")` to keep the spawn stream independent
// of other RNG consumers (xp pick, arena scatter). Per-tick re-fork —
// NOT a closure-captured fork — so mid-replay snapshot restore stays
// byte-stable. Per echo AGENTS.md "Closure-held `ctx.rng.fork()` streams
// are NOT in the snapshot": closure-captured forks drift across
// restore because the parent rng state survives the snapshot but the
// fork's internal advance count does not.
import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { chaser_c, dir_c, hp_c, path_c, state_c, visual_pos_c } from "../components.ts";
import { g } from "../grid.ts";
import { progress_r } from "../resources.ts";

export const SPAWN_EVERY = 60;
export const MAX_CHASERS = 4;

// 8 perimeter cells — corners + cardinal midpoints. Computed against
// the grid extent so a future g.cols / g.rows tweak doesn't drift the
// pool out of bounds.
const spawn_pool = (): readonly { x: number; y: number }[] => {
	const max_x = g.cols - 2;
	const max_y = g.rows - 2;
	const mid_x = Math.floor(g.cols / 2);
	const mid_y = Math.floor(g.rows / 2);
	return [
		{ x: 1, y: 1 },
		{ x: max_x, y: 1 },
		{ x: 1, y: max_y },
		{ x: max_x, y: max_y },
		{ x: mid_x, y: 1 },
		{ x: mid_x, y: max_y },
		{ x: 1, y: mid_y },
		{ x: max_x, y: mid_y },
	];
};

export const make_enemy_spawn_system = (): System => {
	return (w, ctx) => {
		const prog = ctx.res.get(progress_r);
		if (prog.ok && (prog.value.paused || prog.value.dead)) return;
		if (ctx.time.tick % SPAWN_EVERY !== 0) return;

		const alive = w.query([chaser_c] as const).collect().length;
		if (alive >= MAX_CHASERS) return;

		// Per-tick label keeps every spawn draw deterministic AND
		// independent of fork history — survives mid-replay restore (the
		// snapshotter captures `ctx.rng` state but a closure-held forked
		// stream would drift; per-tick re-fork avoids the trap).
		const rng = ctx.rng.fork(`progress.spawn.${ctx.time.tick}`);
		const pool = spawn_pool();
		const cell = pool[rng.int(0, pool.length - 1)]!;
		const world_pos = g.cell_to_world(cell.x, cell.y);
		w.spawn(
			[chaser_c, true],
			[pos_c, world_pos],
			[visual_pos_c, { ...world_pos }],
			[dir_c, { dx: 0, dy: 0 }],
			[hp_c, { current: 1, max: 1 }],
			[state_c, { kind: "idle" }],
			[path_c, { cells: [], idx: 0 }],
		);
	};
};
