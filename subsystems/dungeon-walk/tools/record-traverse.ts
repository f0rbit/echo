import { writeFileSync } from "node:fs";
import { harness, replay } from "@f0rbit/forge";
import type { Cell } from "@dw/resources.ts";
import { game_bindings } from "../src/bindings.ts";
import { g } from "../src/grid.ts";
import { game_plugin } from "../src/plugin.ts";
import { dungeon_r, score_r } from "../src/resources.ts";
import { step_every } from "../src/systems/movement.ts";

const seed = 42;
const fixed_dt = 1 / 60;
const max_ticks = 4000;

const bfs = (
	floors: ReadonlySet<number>,
	from: Cell,
	to: Cell,
): readonly Cell[] => {
	const start_k = g.key(from.x, from.y);
	const goal_k = g.key(to.x, to.y);
	const came_from = new Map<number, number>();
	const queue: number[] = [start_k];
	const seen = new Set<number>([start_k]);
	while (queue.length > 0) {
		const cur = queue.shift()!;
		if (cur === goal_k) break;
		const c = g.unkey(cur);
		for (const n of g.neighbors4(c.x, c.y)) {
			const nk = g.key(n.x, n.y);
			if (seen.has(nk)) continue;
			if (!floors.has(nk)) continue;
			seen.add(nk);
			came_from.set(nk, cur);
			queue.push(nk);
		}
	}
	if (!came_from.has(goal_k) && start_k !== goal_k) {
		throw new Error("no path from spawn to exit");
	}
	const path: Cell[] = [];
	let cur = goal_k;
	while (cur !== start_k) {
		path.push(g.unkey(cur));
		const prev = came_from.get(cur);
		if (prev === undefined) break;
		cur = prev;
	}
	path.push(from);
	path.reverse();
	return path;
};

const sign = (n: number): -1 | 0 | 1 => (n > 0 ? 1 : n < 0 ? -1 : 0);

const h = harness({ seed, fixed_dt, bindings: game_bindings });
const recorder = replay.record_engine(h.input, h.ctx, { seed });

game_plugin(h.world, h.schedule);

h.time.advance(fixed_dt);
h.schedule.tick(h.world, h.ctx);

const dungeon_res = h.res.get(dungeon_r);
if (!dungeon_res.ok) {
	console.error("dungeon not generated");
	process.exit(1);
}
const { floors, spawn, exit } = dungeon_res.value;
const path = bfs(floors, spawn, exit);
console.log(`spawn=(${spawn.x},${spawn.y}) exit=(${exit.x},${exit.y}) path_len=${path.length}`);

let step_idx = 1;
let win_tick = -1;

for (let i = 0; i < max_ticks; i++) {
	if (h.time.tick % step_every === 0 && step_idx < path.length) {
		const cur = path[step_idx - 1]!;
		const next = path[step_idx]!;
		const dx = sign(next.x - cur.x);
		const dy = sign(next.y - cur.y);
		h.input.inject_actions([
			{ kind: "axis", action: "move.x", value: dx },
			{ kind: "axis", action: "move.y", value: dy },
		]);
		step_idx++;
	}
	h.time.advance(fixed_dt);
	h.schedule.tick(h.world, h.ctx);
	const s = h.res.get(score_r);
	if (s.ok && s.value.reached_exit) {
		win_tick = h.time.tick;
		break;
	}
}

if (win_tick === -1) {
	console.error("did not reach exit within", max_ticks, "ticks");
	process.exit(1);
}

h.input.inject_actions([
	{ kind: "axis", action: "move.x", value: 0 },
	{ kind: "axis", action: "move.y", value: 0 },
]);
h.time.advance(fixed_dt);
h.schedule.tick(h.world, h.ctx);

const doc = recorder.stop();
const json = replay.save(doc);
const out_path = new URL("../replays/traverse.replay.json", import.meta.url).pathname;
writeFileSync(out_path, json + "\n");

console.log(`recorded ${doc.frames.length} frames over ${win_tick} ticks -> ${out_path}`);
