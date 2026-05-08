import { describe, expect, test } from "bun:test";
import { harness, pos_c, type Ctx, type World } from "@f0rbit/forge";
import { game_bindings } from "../src/bindings.ts";
import {
	player_c,
	projectile_c,
	ranged_c,
	telegraph_c,
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

const ranged_cell = (sim: Sim): { x: number; y: number } => {
	const list = sim.w.query([pos_c, ranged_c] as const).collect();
	const p = list[0]![1];
	return g.world_to_cell(p.x, p.y);
};

const has_telegraph = (sim: Sim): boolean =>
	sim.w.query([telegraph_c] as const).collect().length > 0;

const projectile_count = (sim: Sim): number =>
	sim.w.query([projectile_c] as const).collect().length;

describe("ranged AI", () => {
	test("ranged enemy spawns at fixed cell", () => {
		const sim = make_sim();
		expect(ranged_cell(sim)).toEqual({ x: 20, y: 5 });
	});

	test("telegraph spawns when player in sweet-spot LOS", () => {
		const sim = make_sim();
		const r0 = ranged_cell(sim);
		teleport_player(sim, r0.x - 6, r0.y);
		let saw_telegraph = false;
		for (let i = 0; i < 30; i++) {
			sim.tick();
			if (has_telegraph(sim)) {
				saw_telegraph = true;
				break;
			}
		}
		expect(saw_telegraph).toBe(true);
	});

	test("after telegraph countdown, projectile spawns and advances toward target", () => {
		const sim = make_sim();
		const r0 = ranged_cell(sim);
		teleport_player(sim, r0.x - 6, r0.y);
		let first_index: number | null = null;
		let later_index: number | null = null;
		for (let i = 0; i < 300; i++) {
			sim.tick();
			const list = sim.w.query([projectile_c] as const).collect();
			if (list.length === 0) continue;
			const idx = list[0]![1].index;
			if (first_index === null) first_index = idx;
			else later_index = idx;
		}
		expect(first_index).not.toBeNull();
		expect(later_index).not.toBeNull();
		expect(later_index!).toBeGreaterThanOrEqual(first_index!);
	});

	test("ranged kites away when player too close", () => {
		const sim = make_sim();
		const r0 = ranged_cell(sim);
		teleport_player(sim, r0.x - 1, r0.y);
		const start_dist = 1;
		let max_dist = start_dist;
		for (let i = 0; i < 60; i++) {
			sim.tick();
			const r = ranged_cell(sim);
			const pl = sim.w.query([pos_c, player_c] as const).collect()[0]![1];
			const pc = g.world_to_cell(pl.x, pl.y);
			const d = g.chebyshev(r, pc);
			if (d > max_dist) max_dist = d;
		}
		expect(max_dist).toBeGreaterThan(start_dist);
	});

	test("determinism: two runs produce identical telegraph + projectile counts", () => {
		const run = (): readonly number[] => {
			const sim = make_sim();
			const r0 = ranged_cell(sim);
			teleport_player(sim, r0.x - 6, r0.y);
			const samples: number[] = [];
			for (let i = 0; i < 200; i++) {
				sim.tick();
				if (i % 20 === 0) {
					samples.push(has_telegraph(sim) ? 1 : 0);
					samples.push(projectile_count(sim));
				}
			}
			return samples;
		};
		expect(run()).toEqual(run());
	});
});
