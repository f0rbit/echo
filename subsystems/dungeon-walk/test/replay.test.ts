import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { harness, replay } from "@f0rbit/forge";
import type { Ctx, ReplayDoc, World } from "@f0rbit/forge";
import { presets } from "@f0rbit/forge/presets";
import { game_plugin } from "../src/plugin.ts";
import { dungeon_r, score_r } from "../src/resources.ts";

const replay_path = new URL("../replays/traverse.replay.json", import.meta.url).pathname;
const replay_json = readFileSync(replay_path, "utf8");

type Sim = { ctx: Ctx; w: World; tick: () => void };

const make_sim = (doc: ReplayDoc): Sim => {
	const h = harness({ seed: doc.seed, fixed_dt: doc.fixed_dt, bindings: presets.movement2d });
	game_plugin(h.world, h.schedule);
	replay.play(doc, h.input, () => h.time.tick);
	return {
		ctx: h.ctx,
		w: h.world,
		tick: () => {
			h.time.advance(doc.fixed_dt);
			h.schedule.tick(h.world, h.ctx);
		},
	};
};

const hash_world = (ctx: Ctx, w: World): string => {
	const score = ctx.res.get(score_r);
	const dungeon = ctx.res.get(dungeon_r);
	const reached = score.ok ? score.value.reached_exit : false;
	const floor_count = dungeon.ok ? dungeon.value.floors.size : -1;
	const entities = w.count();
	return `r=${reached}|f=${floor_count}|n=${entities}`;
};

const tick_count = 1500;

describe("dungeon-walk replay deliverable", () => {
	test("loaded replay JSON parses cleanly", () => {
		const r = replay.load(replay_json);
		expect(r.ok).toBe(true);
	});

	test("seed 42 generates a deterministic dungeon with spawn != exit", () => {
		const r = replay.load(replay_json);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const sim = make_sim(r.value);
		sim.tick();
		const d = sim.ctx.res.get(dungeon_r);
		expect(d.ok).toBe(true);
		if (!d.ok) return;
		expect(d.value.floors.size).toBeGreaterThan(0);
		expect(d.value.spawn).not.toEqual(d.value.exit);
	});

	test("replaying traverse.replay.json reaches the exit", () => {
		const r = replay.load(replay_json);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const sim = make_sim(r.value);
		for (let i = 0; i < tick_count; i++) sim.tick();
		const score = sim.ctx.res.get(score_r);
		expect(score.ok).toBe(true);
		if (score.ok) expect(score.value.reached_exit).toBe(true);
	});

	test("replay is deterministic — two runs produce identical world hash", () => {
		const r1 = replay.load(replay_json);
		const r2 = replay.load(replay_json);
		expect(r1.ok).toBe(true);
		expect(r2.ok).toBe(true);
		if (!r1.ok || !r2.ok) return;

		const sim_a = make_sim(r1.value);
		const sim_b = make_sim(r2.value);
		for (let i = 0; i < tick_count; i++) {
			sim_a.tick();
			sim_b.tick();
		}
		expect(hash_world(sim_a.ctx, sim_a.w)).toBe(hash_world(sim_b.ctx, sim_b.w));
	});
});
