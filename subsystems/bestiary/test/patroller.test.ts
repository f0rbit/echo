import { describe, expect, test } from "bun:test";
import { harness, pos_c, type Ctx, type World } from "@f0rbit/forge";
import { game_bindings } from "../src/bindings.ts";
import { patrol_c, patroller_c, player_c } from "../src/components.ts";
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

const patroller_cell = (sim: Sim): { x: number; y: number } => {
	const list = sim.w.query([pos_c, patroller_c] as const).collect();
	const p = list[0]![1];
	return g.world_to_cell(p.x, p.y);
};

const patroller_data = (sim: Sim) => {
	const list = sim.w.query([pos_c, patrol_c, patroller_c] as const).collect();
	return list[0]![2];
};

const world_hash = (sim: Sim): string => {
	const pat = patroller_cell(sim);
	const pd = patroller_data(sim);
	return `${pat.x},${pat.y}|${pd.index}|${pd.fsm.state}`;
};

describe("patroller AI", () => {
	test("patroller spawns at fixed cell with waypoints", () => {
		const sim = make_sim();
		const cell = patroller_cell(sim);
		expect(cell).toEqual({ x: 10, y: 10 });
		const data = patroller_data(sim);
		expect(data.waypoints.length).toBe(4);
		expect(data.index).toBe(0);
		expect(data.aggro_radius).toBeGreaterThan(0);
	});

	test("patroller cycles through waypoints over a long enough run", () => {
		const sim = make_sim();
		teleport_player(sim, 1, 1);
		const list = sim.w.query([pos_c, patrol_c, patroller_c] as const).collect();
		const [pid, , pd0] = list[0]!;
		sim.w.set(pid, patrol_c, { ...pd0, aggro_radius: 0 });
		const seen = new Set<number>();
		seen.add(patroller_data(sim).index);
		for (let i = 0; i < 2000; i++) {
			sim.tick();
			seen.add(patroller_data(sim).index);
			if (seen.size >= 4) break;
		}
		expect(seen.size).toBeGreaterThanOrEqual(3);
	});

	test("patroller pursues player when in LOS", () => {
		const sim = make_sim();
		const start = patroller_cell(sim);
		teleport_player(sim, start.x + 2, start.y);
		for (let i = 0; i < 36; i++) sim.tick();
		const data = patroller_data(sim);
		expect(data.fsm.state).toBe("pursuing");
	});

	test("patroller transitions back to patrolling after losing LOS", () => {
		const sim = make_sim();
		const start = patroller_cell(sim);
		teleport_player(sim, start.x + 2, start.y);
		for (let i = 0; i < 24; i++) sim.tick();
		expect(patroller_data(sim).fsm.state).toBe("pursuing");
		const list = sim.w.query([pos_c, patrol_c, patroller_c] as const).collect();
		const [pid, , pd0] = list[0]!;
		sim.w.set(pid, patrol_c, { ...pd0, aggro_radius: 0 });
		teleport_player(sim, 1, 1);
		let saw_returning = false;
		for (let i = 0; i < 2000; i++) {
			sim.tick();
			const s = patroller_data(sim).fsm.state;
			if (s === "returning") saw_returning = true;
			if (s === "patrolling") break;
		}
		expect(saw_returning).toBe(true);
		expect(patroller_data(sim).fsm.state).toBe("patrolling");
	});

	test("determinism: two runs produce identical world hashes", () => {
		const run = (): string[] => {
			const sim = make_sim();
			teleport_player(sim, 1, 1);
			const hashes: string[] = [];
			for (let i = 0; i < 200; i++) {
				sim.tick();
				if (i % 20 === 0) hashes.push(world_hash(sim));
			}
			return hashes;
		};
		const a = run();
		const b = run();
		expect(a).toEqual(b);
	});
});
