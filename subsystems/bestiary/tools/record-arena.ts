import { writeFileSync } from "node:fs";
import { harness, replay } from "@f0rbit/forge";
import { game_bindings } from "../src/bindings.ts";
import { game_plugin } from "../src/plugin.ts";

const seed = 42;
const fixed_dt = 1 / 60;
const total_ticks = 600;

type Step = { from: number; to: number; dx: -1 | 0 | 1; dy: -1 | 0 | 1 };

const steps: readonly Step[] = [
	{ from: 0, to: 200, dx: -1, dy: 0 },
	{ from: 200, to: 400, dx: 0, dy: 1 },
	{ from: 400, to: 600, dx: 1, dy: 0 },
];

const h = harness({ seed, fixed_dt, bindings: game_bindings });
const recorder = replay.record(h.input, h.ctx, { seed });

game_plugin(h.world, h.schedule);

h.time.advance(fixed_dt);
h.schedule.tick(h.world, h.ctx);

let dir_dx: -1 | 0 | 1 = 0;
let dir_dy: -1 | 0 | 1 = 0;

for (let i = 0; i < total_ticks; i++) {
	const tick = h.time.tick;
	const seg = steps.find(s => tick >= s.from && tick < s.to);
	const next_dx = seg ? seg.dx : 0;
	const next_dy = seg ? seg.dy : 0;
	if (next_dx !== dir_dx || next_dy !== dir_dy) {
		h.input.inject_actions([
			{ kind: "axis", action: "move.x", value: next_dx },
			{ kind: "axis", action: "move.y", value: next_dy },
		]);
		dir_dx = next_dx;
		dir_dy = next_dy;
	}
	h.time.advance(fixed_dt);
	h.schedule.tick(h.world, h.ctx);
}

h.input.inject_actions([
	{ kind: "axis", action: "move.x", value: 0 },
	{ kind: "axis", action: "move.y", value: 0 },
]);
h.time.advance(fixed_dt);
h.schedule.tick(h.world, h.ctx);

const doc = recorder.stop();
const json = replay.save(doc);
const out_path = new URL("../replays/arena.replay.json", import.meta.url).pathname;
writeFileSync(out_path, json + "\n");

console.log(`recorded ${doc.frames.length} frames over ${total_ticks} ticks -> ${out_path}`);
