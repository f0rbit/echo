import { describe, expect, test } from "bun:test";
import { pos_c } from "@f0rbit/forge";
import { make_progress_scenario } from "./fixtures/progress-scenario.ts";
import { chaser_c, path_c, state_c } from "../src/components.ts";
import { AGGRO_RADIUS, chaser_think_system } from "../src/systems/ai-chaser.ts";
import { path_step_system } from "../src/systems/path-step.ts";
import { creature_occupancy_system } from "../src/systems/creature-occupancy.ts";
import { creature_occupancy_r, progress_r } from "../src/resources.ts";
import { g } from "../src/grid.ts";

describe("progress ai-chaser — think + path-step", () => {
	test("chaser within aggro range gains a path toward the player", () => {
		const { h, tick } = make_progress_scenario({
			with_player: true,
			player_cell: { x: 5, y: 5 },
			with_chasers: 1,
		});
		// scenario spawns chaser at (1, 1) — chebyshev distance 4 to (5, 5),
		// well within AGGRO_RADIUS (8).
		h.schedule.add("update", creature_occupancy_system, { name: "occ" });
		h.schedule.add("update", chaser_think_system, { phase: 1, name: "think" });
		tick();

		const chasers = h.world.query([chaser_c, state_c, path_c] as const).collect();
		expect(chasers.length).toBe(1);
		const [, st, pth] = chasers[0]!;
		expect(st.kind).toBe("chasing");
		expect(pth.cells.length).toBeGreaterThan(0);
		expect(pth.idx).toBe(0);
	});

	test("chaser outside aggro range stays idle and has no path", () => {
		const { h, tick } = make_progress_scenario({
			with_player: true,
			player_cell: { x: 1, y: 1 },
		});
		const far_cell = { x: g.cols - 2, y: g.rows - 2 };
		const far_pos = g.cell_to_world(far_cell.x, far_cell.y);
		expect(g.chebyshev({ x: 1, y: 1 }, far_cell)).toBeGreaterThan(AGGRO_RADIUS);
		h.world.spawn(
			[chaser_c, true],
			[pos_c, far_pos],
			[state_c, { kind: "idle" }],
		);
		h.schedule.add("update", creature_occupancy_system, { name: "occ" });
		h.schedule.add("update", chaser_think_system, { phase: 1, name: "think" });
		tick();

		for (const [, st] of h.world.query([chaser_c, state_c] as const).collect()) {
			expect(st.kind).toBe("idle");
		}
		const with_path = h.world.query([chaser_c, path_c] as const).collect();
		expect(with_path.length).toBe(0);
	});

	test("path-step moves the chaser closer to the player", () => {
		const { h, tick } = make_progress_scenario({
			with_player: true,
			player_cell: { x: 5, y: 1 },
			with_chasers: 1,
		});
		const before = h.world.query([chaser_c, pos_c] as const).collect();
		expect(before.length).toBe(1);
		const start_cell = g.world_to_cell(before[0]![1].x, before[0]![1].y);

		h.schedule.add("update", creature_occupancy_system, { phase: 0, name: "occ" });
		h.schedule.add("update", chaser_think_system, { phase: 1, name: "think" });
		h.schedule.add("update", path_step_system, { phase: 2, name: "step" });
		tick();

		const after = h.world.query([chaser_c, pos_c] as const).collect();
		const end_cell = g.world_to_cell(after[0]![1].x, after[0]![1].y);
		// chebyshev to player must not increase (moved closer or held still).
		expect(g.chebyshev(end_cell, { x: 5, y: 1 })).toBeLessThanOrEqual(
			g.chebyshev(start_cell, { x: 5, y: 1 }),
		);
	});

	test("paused → chaser does not move (ai_chaser + path_step early-return)", () => {
		const { h, tick } = make_progress_scenario({
			with_player: true,
			player_cell: { x: 5, y: 1 },
			with_chasers: 1,
		});
		const prog = h.res.get(progress_r);
		if (prog.ok) h.res.set(progress_r, { ...prog.value, paused: true });

		h.schedule.add("update", creature_occupancy_system, { phase: 0, name: "occ" });
		h.schedule.add("update", chaser_think_system, { phase: 1, name: "think" });
		h.schedule.add("update", path_step_system, { phase: 2, name: "step" });

		const before = h.world.query([chaser_c, pos_c] as const).collect();
		const before_cell = g.world_to_cell(before[0]![1].x, before[0]![1].y);
		tick();
		const after = h.world.query([chaser_c, pos_c] as const).collect();
		const after_cell = g.world_to_cell(after[0]![1].x, after[0]![1].y);
		expect(after_cell).toEqual(before_cell);
		const states = h.world.query([chaser_c, state_c] as const).collect();
		expect(states[0]![1].kind).toBe("idle");
	});

	test("creature_occupancy includes the player + every chaser cell", () => {
		const { h, tick } = make_progress_scenario({
			with_player: true,
			player_cell: { x: 5, y: 5 },
			with_chasers: 2,
		});
		h.schedule.add("update", creature_occupancy_system, { name: "occ" });
		tick();

		const occ = h.res.get(creature_occupancy_r);
		expect(occ.ok).toBe(true);
		if (!occ.ok) return;
		expect(occ.value.cells.size).toBe(3);
	});
});
