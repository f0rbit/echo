import { describe, expect, test } from "bun:test";
import { harness, pos_c, type Ctx, type World } from "@f0rbit/forge";
import { game_bindings } from "../src/bindings.ts";
import { game_plugin } from "../src/plugin.ts";
import { dungeon_r, score_r, win_overlay_r } from "../src/resources.ts";
import { player_c } from "../src/components.ts";
import { cell_to_world, key, world_to_cell } from "../src/grid.ts";
import { step_every } from "../src/systems/movement.ts";

const seed = 42;
const fixed_dt = 1 / 60;

type Sim = {
	ctx: Ctx;
	w: World;
	tick: () => void;
	inject: (dx: number, dy: number) => void;
};

const make_sim = (overlay_calls?: boolean[]): Sim => {
	const h = harness({ seed, fixed_dt, bindings: game_bindings });
	if (overlay_calls) {
		h.res.set(win_overlay_r, {
			show: visible => {
				overlay_calls.push(visible);
			},
		});
	}
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
		inject: (dx, dy) =>
			h.input.inject_actions([
				{ kind: "axis", action: "move.x", value: dx },
				{ kind: "axis", action: "move.y", value: dy },
			]),
	};
};

const player_cell = (sim: Sim): { x: number; y: number } => {
	const players = sim.w.query([pos_c, player_c] as const).collect();
	const p = players[0]![1];
	return world_to_cell(p.x, p.y);
};

const teleport_player = (sim: Sim, x: number, y: number): void => {
	const players = sim.w.query([pos_c, player_c] as const).collect();
	const id = players[0]![0];
	const w = cell_to_world(x, y);
	sim.w.set(id, pos_c, { x: w.x, y: w.y });
};

describe("dungeon-walk win condition", () => {
	test("reached_exit flag flips when player steps onto the exit cell", () => {
		const sim = make_sim();
		const d = sim.ctx.res.get(dungeon_r);
		expect(d.ok).toBe(true);
		if (!d.ok) return;
		const { exit, floors } = d.value;
		const candidates = [
			{ dx: 1, dy: 0 },
			{ dx: -1, dy: 0 },
			{ dx: 0, dy: 1 },
			{ dx: 0, dy: -1 },
		];
		const adj = candidates.find(dr =>
			floors.has(key(exit.x - dr.dx, exit.y - dr.dy)),
		);
		expect(adj).toBeDefined();
		if (!adj) return;
		teleport_player(sim, exit.x - adj.dx, exit.y - adj.dy);
		const before = sim.ctx.res.get(score_r);
		expect(before.ok && before.value.reached_exit).toBe(false);
		sim.inject(adj.dx, adj.dy);
		for (let i = 0; i < step_every; i++) sim.tick();
		expect(player_cell(sim)).toEqual({ x: exit.x, y: exit.y });
		const after = sim.ctx.res.get(score_r);
		expect(after.ok && after.value.reached_exit).toBe(true);
	});

	test("movement system halts after reaching exit — further input does nothing", () => {
		const sim = make_sim();
		const d = sim.ctx.res.get(dungeon_r);
		if (!d.ok) return;
		const { exit, floors } = d.value;
		const adj = [
			{ dx: 1, dy: 0 },
			{ dx: -1, dy: 0 },
			{ dx: 0, dy: 1 },
			{ dx: 0, dy: -1 },
		].find(dr => floors.has(key(exit.x - dr.dx, exit.y - dr.dy)));
		if (!adj) return;
		teleport_player(sim, exit.x - adj.dx, exit.y - adj.dy);
		sim.inject(adj.dx, adj.dy);
		for (let i = 0; i < step_every; i++) sim.tick();
		const at_exit = player_cell(sim);
		expect(at_exit).toEqual({ x: exit.x, y: exit.y });
		const back = [
			{ dx: 1, dy: 0 },
			{ dx: -1, dy: 0 },
			{ dx: 0, dy: 1 },
			{ dx: 0, dy: -1 },
		].find(dr => floors.has(key(exit.x + dr.dx, exit.y + dr.dy)));
		if (!back) return;
		sim.inject(back.dx, back.dy);
		for (let i = 0; i < step_every * 4; i++) sim.tick();
		expect(player_cell(sim)).toEqual(at_exit);
	});

	test("win overlay receives a true call after the player reaches the exit", () => {
		const calls: boolean[] = [];
		const sim = make_sim(calls);
		const d = sim.ctx.res.get(dungeon_r);
		if (!d.ok) return;
		const { exit, floors } = d.value;
		const adj = [
			{ dx: 1, dy: 0 },
			{ dx: -1, dy: 0 },
			{ dx: 0, dy: 1 },
			{ dx: 0, dy: -1 },
		].find(dr => floors.has(key(exit.x - dr.dx, exit.y - dr.dy)));
		if (!adj) return;
		teleport_player(sim, exit.x - adj.dx, exit.y - adj.dy);
		sim.inject(adj.dx, adj.dy);
		for (let i = 0; i < step_every * 2; i++) sim.tick();
		expect(calls.some(c => c === true)).toBe(true);
	});
});
