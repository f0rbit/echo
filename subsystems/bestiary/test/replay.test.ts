import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { harness, pos_c, replay } from "@f0rbit/forge";
import type { Ctx, ReplayDoc, World } from "@f0rbit/forge";
import { replay_schema } from "@f0rbit/forge";
import { game_bindings } from "../src/bindings.ts";
import {
	chaser_c,
	minion_c,
	patroller_c,
	player_c,
	projectile_c,
	ranged_c,
	summoner_c,
	telegraph_c,
} from "../src/components.ts";
import { g } from "../src/grid.ts";
import { game_plugin } from "../src/plugin.ts";

const replay_path = new URL("../replays/arena.replay.json", import.meta.url).pathname;
const replay_json = readFileSync(replay_path, "utf8");
const expected_hash = "d171ad9fbb39cfc98e642b36dd5d6390be516e136b2254580f395b035a1cd444";

type Sim = { ctx: Ctx; w: World; tick: () => void };

const make_sim = (doc: ReplayDoc): Sim => {
	const h = harness({ seed: doc.seed, fixed_dt: doc.fixed_dt, bindings: game_bindings });
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

const cell_of = (sim: Sim, marker: Parameters<World["query"]>[0][number]): { x: number; y: number } | null => {
	const list = sim.w.query([pos_c, marker] as const).collect();
	const p = list[0]?.[1];
	if (!p) return null;
	return g.world_to_cell(p.x, p.y);
};

const cells_of = (sim: Sim, marker: Parameters<World["query"]>[0][number]): readonly { x: number; y: number }[] =>
	sim.w
		.query([pos_c, marker] as const)
		.collect()
		.map(([, p]) => g.world_to_cell(p.x, p.y));

const sorted_cell_pairs = (cells: readonly { x: number; y: number }[]): readonly [number, number][] =>
	[...cells]
		.map(c => [c.x, c.y] as [number, number])
		.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

const world_hash = (sim: Sim): string => {
	const snap = {
		players: sorted_cell_pairs(cells_of(sim, player_c)),
		chasers: sorted_cell_pairs(cells_of(sim, chaser_c)),
		patrollers: sorted_cell_pairs(cells_of(sim, patroller_c)),
		rangeds: sorted_cell_pairs(cells_of(sim, ranged_c)),
		summoners: sorted_cell_pairs(cells_of(sim, summoner_c)),
		minions: sorted_cell_pairs(cells_of(sim, minion_c)),
		proj: sim.w.query([projectile_c] as const).collect().length,
		tel: sim.w.query([telegraph_c] as const).collect().length,
	};
	return createHash("sha256").update(JSON.stringify(snap)).digest("hex");
};

const advance_to = (sim: Sim, tick: number): void => {
	const ctx = sim.ctx as Ctx & { time: { tick: number } };
	while (ctx.time.tick < tick) sim.tick();
};

describe("bestiary replay deliverable", () => {
	test("replay JSON loads and validates against replay_schema", () => {
		const r = replay.load(replay_json);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const parsed = replay_schema.safeParse(JSON.parse(replay_json));
		expect(parsed.success).toBe(true);
		expect(r.value.seed).toBe(42);
		expect(r.value.frames.length).toBeGreaterThan(0);
	});

	test("tick 60 — chaser distance to player has decreased from spawn", () => {
		const r = replay.load(replay_json);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const sim = make_sim(r.value);
		sim.tick();
		const start_chasers = cells_of(sim, chaser_c);
		const start_player = cell_of(sim, player_c)!;
		const start_min = Math.min(...start_chasers.map(c => g.chebyshev(c, start_player)));
		advance_to(sim, 60);
		const end_chasers = cells_of(sim, chaser_c);
		const end_player = cell_of(sim, player_c)!;
		const end_min = Math.min(...end_chasers.map(c => g.chebyshev(c, end_player)));
		expect(end_min).toBeLessThan(start_min);
	});

	test("tick 120 — patroller has moved at least 1 cell from spawn (10,10)", () => {
		const r = replay.load(replay_json);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const sim = make_sim(r.value);
		advance_to(sim, 120);
		const pat = cell_of(sim, patroller_c)!;
		const dist = g.chebyshev(pat, { x: 10, y: 10 });
		expect(dist).toBeGreaterThanOrEqual(1);
	});

	test("tick 60 — ranged has at least 1 telegraph_c (within sweet-spot range)", () => {
		const r = replay.load(replay_json);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const sim = make_sim(r.value);
		advance_to(sim, 60);
		const tels = sim.w.query([telegraph_c] as const).collect();
		expect(tels.length).toBeGreaterThanOrEqual(1);
	});

	test("tick 90 — summoner has spawned at least 1 minion (cap 4)", () => {
		const r = replay.load(replay_json);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const sim = make_sim(r.value);
		advance_to(sim, 90);
		const minions = cells_of(sim, minion_c);
		expect(minions.length).toBeGreaterThanOrEqual(1);
		expect(minions.length).toBeLessThan(4);
	});

	test("tick 600 — world hash matches expected snapshot", () => {
		const r = replay.load(replay_json);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		const sim = make_sim(r.value);
		advance_to(sim, 600);
		expect(world_hash(sim)).toBe(expected_hash);
	});

	test("two consecutive replay runs produce byte-identical world hashes", () => {
		const r1 = replay.load(replay_json);
		const r2 = replay.load(replay_json);
		expect(r1.ok).toBe(true);
		expect(r2.ok).toBe(true);
		if (!r1.ok || !r2.ok) return;
		const sim_a = make_sim(r1.value);
		const sim_b = make_sim(r2.value);
		advance_to(sim_a, 600);
		advance_to(sim_b, 600);
		expect(world_hash(sim_a)).toBe(world_hash(sim_b));
	});
});
