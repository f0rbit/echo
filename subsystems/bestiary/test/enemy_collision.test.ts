import { describe, expect, test } from "bun:test";
import { harness, pos_c, type Ctx, type World } from "@f0rbit/forge";
import { game_bindings } from "../src/bindings.ts";
import {
	chaser_c,
	enemy_c,
	minion_c,
	patroller_c,
	player_c,
	summoner_c,
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
	sim.w.set(pl[0]![0], pos_c, g.cell_to_world(x, y));
};

const enemy_cells = (sim: Sim): readonly number[] =>
	sim.w
		.query([pos_c, enemy_c] as const)
		.collect()
		.map(([, p]) => {
			const c = g.world_to_cell(p.x, p.y);
			return g.key(c.x, c.y);
		});

const has_overlap = (cells: readonly number[]): boolean => {
	const seen = new Set<number>();
	for (const k of cells) {
		if (seen.has(k)) return true;
		seen.add(k);
	}
	return false;
};

const player_cell = (sim: Sim): number => {
	const pl = sim.w.query([pos_c, player_c] as const).collect();
	const c = g.world_to_cell(pl[0]![1].x, pl[0]![1].y);
	return g.key(c.x, c.y);
};

describe("enemy collision", () => {
	test("no two enemies share a cell across the default arena run", () => {
		const sim = make_sim();
		for (let i = 0; i < 600; i++) {
			sim.tick();
			const cells = enemy_cells(sim);
			expect(has_overlap(cells)).toBe(false);
		}
	});

	test("no enemy ever shares the player's cell across the default arena run", () => {
		const sim = make_sim();
		for (let i = 0; i < 600; i++) {
			sim.tick();
			const pk = player_cell(sim);
			const cells = enemy_cells(sim);
			expect(cells.includes(pk)).toBe(false);
		}
	});

	test("chasers funneled toward a cornered player never stand on the player", () => {
		const sim = make_sim();
		teleport_player(sim, 1, 1);
		for (let i = 0; i < 200; i++) {
			sim.tick();
			const pk = player_cell(sim);
			const ch_keys = sim.w
				.query([pos_c, chaser_c] as const)
				.collect()
				.map(([, p]) => {
					const c = g.world_to_cell(p.x, p.y);
					return g.key(c.x, c.y);
				});
			expect(ch_keys.includes(pk)).toBe(false);
		}
	});

	test("two chasers funneled to same target never stack on same cell", () => {
		const sim = make_sim();
		teleport_player(sim, 1, 1);
		for (let i = 0; i < 200; i++) {
			sim.tick();
			const ch_keys = sim.w
				.query([pos_c, chaser_c] as const)
				.collect()
				.map(([, p]) => {
					const c = g.world_to_cell(p.x, p.y);
					return g.key(c.x, c.y);
				});
			expect(has_overlap(ch_keys)).toBe(false);
		}
	});

	test("summoner does not spawn a minion onto an occupied adjacent cell", () => {
		const sim = make_sim();
		teleport_player(sim, 1, 1);
		for (let i = 0; i < 600; i++) {
			sim.tick();
			const sum = sim.w.query([pos_c, summoner_c] as const).collect();
			const min_cells = sim.w
				.query([pos_c, minion_c] as const)
				.collect()
				.map(([, p]) => g.world_to_cell(p.x, p.y));
			const sum_cell = g.world_to_cell(sum[0]![1].x, sum[0]![1].y);
			for (const m of min_cells) {
				expect(m.x === sum_cell.x && m.y === sum_cell.y).toBe(false);
			}
			const keys = min_cells.map(c => g.key(c.x, c.y));
			expect(has_overlap(keys)).toBe(false);
		}
	});

	test("patroller and chaser sharing a corridor never end on the same cell", () => {
		const sim = make_sim();
		teleport_player(sim, 1, 1);
		for (let i = 0; i < 400; i++) {
			sim.tick();
			const pat = sim.w.query([pos_c, patroller_c] as const).collect();
			const chasers = sim.w.query([pos_c, chaser_c] as const).collect();
			const pat_cell = g.world_to_cell(pat[0]![1].x, pat[0]![1].y);
			const pat_key = g.key(pat_cell.x, pat_cell.y);
			for (const [, p] of chasers) {
				const c = g.world_to_cell(p.x, p.y);
				expect(g.key(c.x, c.y)).not.toBe(pat_key);
			}
		}
	});
});
