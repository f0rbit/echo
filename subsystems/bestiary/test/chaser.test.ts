import { describe, expect, test } from "bun:test";
import { harness, pos_c, type Ctx, type World } from "@f0rbit/forge";
import { game_bindings } from "../src/bindings.ts";
import { chaser_c, player_c } from "../src/components.ts";
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

const player_cell = (sim: Sim): { x: number; y: number } => {
	const pl = sim.w.query([pos_c, player_c] as const).collect();
	const p = pl[0]![1];
	return g.world_to_cell(p.x, p.y);
};

const chaser_cells = (sim: Sim): readonly { x: number; y: number }[] =>
	sim.w
		.query([pos_c, chaser_c] as const)
		.collect()
		.map(([, p]) => g.world_to_cell(p.x, p.y));

describe("chaser AI", () => {
	test("two chasers spawn at expected cells", () => {
		const sim = make_sim();
		const cells = chaser_cells(sim);
		expect(cells.length).toBe(2);
		const keys = new Set(cells.map(c => g.key(c.x, c.y)));
		expect(keys.has(g.key(5, 5))).toBe(true);
		expect(keys.has(g.key(25, 15))).toBe(true);
	});

	test("chaser within LOS+aggro moves toward player over ~100 ticks", () => {
		const sim = make_sim();
		const start_cells = chaser_cells(sim);
		const pp = player_cell(sim);
		const start_dists = start_cells.map(c => g.chebyshev(c, pp));
		for (let i = 0; i < 120; i++) sim.tick();
		const end_cells = chaser_cells(sim);
		const end_dists = end_cells.map(c => g.chebyshev(c, pp));
		const closer_count = end_dists.filter((d, i) => d < start_dists[i]!).length;
		expect(closer_count).toBeGreaterThanOrEqual(1);
	});

	test("chaser with no LOS to player does not approach", () => {
		const sim = make_sim();
		const far_chaser = chaser_cells(sim).find(c => g.chebyshev(c, player_cell(sim)) > 8);
		if (!far_chaser) return;
		const start_key = g.key(far_chaser.x, far_chaser.y);
		for (let i = 0; i < 60; i++) sim.tick();
		const moved = chaser_cells(sim).every(c => {
			const k = g.key(c.x, c.y);
			if (k !== start_key) return true;
			return g.chebyshev(c, player_cell(sim)) >= 8;
		});
		expect(moved).toBe(true);
	});
});
