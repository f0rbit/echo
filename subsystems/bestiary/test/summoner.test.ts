import { describe, expect, test } from "bun:test";
import { harness, pos_c, type Ctx, type World } from "@f0rbit/forge";
import { game_bindings } from "../src/bindings.ts";
import {
	minion_c,
	player_c,
	summoner_c,
	summoner_state_c,
} from "../src/components.ts";
import { g } from "../src/grid.ts";
import { game_plugin } from "../src/plugin.ts";

const fixed_dt = 1 / 60;
const seed = 42;

type Sim = { ctx: Ctx; w: World; tick: () => void };

const make_sim = (): Sim => {
	const h = harness({ seed, fixed_dt, bindings: game_bindings });
	game_plugin(h.world, h.schedule);
	h.time.advance(fixed_dt);
	h.schedule.tick(h.world, h.ctx);
	return {
		ctx: h.ctx,
		w: h.world,
		tick: () => {
			h.time.advance(fixed_dt);
			h.schedule.tick(h.world, h.ctx);
		},
	};
};

const teleport_player = (sim: Sim, x: number, y: number): void => {
	const pl = sim.w.query([pos_c, player_c] as const).collect();
	const id = pl[0]![0];
	sim.w.set(id, pos_c, g.cell_to_world(x, y));
};

const minion_count = (sim: Sim): number =>
	sim.w.query([minion_c] as const).collect().length;

const summoner_cell = (sim: Sim): { x: number; y: number } => {
	const list = sim.w.query([pos_c, summoner_c] as const).collect();
	const p = list[0]![1];
	return g.world_to_cell(p.x, p.y);
};

const minion_cells = (sim: Sim): readonly { x: number; y: number }[] =>
	sim.w
		.query([pos_c, minion_c] as const)
		.collect()
		.map(([, p]) => g.world_to_cell(p.x, p.y));

describe("summoner AI", () => {
	test("summoner spawns at fixed cell with state", () => {
		const sim = make_sim();
		expect(summoner_cell(sim)).toEqual({ x: 15, y: 4 });
		const list = sim.w.query([summoner_state_c, summoner_c] as const).collect();
		const st = list[0]![1];
		expect(st.spawn_every).toBe(60);
		expect(st.max_minions).toBe(4);
		expect(minion_count(sim)).toBe(0);
	});

	test("first minion spawns at expected tick adjacent to summoner", () => {
		const sim = make_sim();
		teleport_player(sim, 1, 1);
		const sc = summoner_cell(sim);
		for (let i = 0; i < 80; i++) sim.tick();
		expect(minion_count(sim)).toBeGreaterThanOrEqual(1);
		const cells = minion_cells(sim);
		for (const c of cells) {
			expect(g.chebyshev(c, sc)).toBeLessThanOrEqual(1);
		}
	});

	test("cap enforced — N spawns produce exactly max_minions, not more", () => {
		const sim = make_sim();
		teleport_player(sim, 1, 1);
		for (let i = 0; i < 600; i++) sim.tick();
		expect(minion_count(sim)).toBe(4);
	});

	test("determinism: two runs produce identical minion counts and cells", () => {
		const run = (): readonly string[] => {
			const sim = make_sim();
			teleport_player(sim, 1, 1);
			const samples: string[] = [];
			for (let i = 0; i < 400; i++) {
				sim.tick();
				if (i % 40 === 0) {
					const cells = minion_cells(sim)
						.map(c => g.key(c.x, c.y))
						.sort((a, b) => a - b)
						.join(",");
					samples.push(`${minion_count(sim)}|${cells}`);
				}
			}
			return samples;
		};
		expect(run()).toEqual(run());
	});
});
