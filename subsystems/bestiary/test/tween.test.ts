import { describe, expect, test } from "bun:test";
import { harness, pos_c, type Ctx, type World } from "@f0rbit/forge";
import { game_bindings } from "../src/bindings.ts";
import { player_c, visual_pos_c } from "../src/components.ts";
import { game_plugin } from "../src/plugin.ts";

const seed = 42;
const fixed_dt = 1 / 60;

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

describe("bestiary visual_pos tween", () => {
	test("visual_pos_c is initialised to the same coords as pos_c on spawn", () => {
		const sim = make_sim();
		const rows = sim.w.query([pos_c, visual_pos_c] as const).collect();
		expect(rows.length).toBeGreaterThan(0);
		for (const [, p, v] of rows) {
			expect(v.x).toBe(p.x);
			expect(v.y).toBe(p.y);
		}
	});

	test("tween_step_system lerps visual_pos toward pos_c after a teleport", () => {
		const sim = make_sim();
		const rows = sim.w.query([pos_c, visual_pos_c, player_c] as const).collect();
		const id = rows[0]![0];
		const start = rows[0]![1];
		const target = { x: start.x + 64, y: start.y + 32 };
		sim.w.set(id, pos_c, target);
		const initial_v = sim.w.query([pos_c, visual_pos_c, player_c] as const).collect()[0]![2];
		const initial_dx = Math.abs(target.x - initial_v.x);

		sim.tick();
		const after_one = sim.w.query([pos_c, visual_pos_c, player_c] as const).collect()[0]![2];
		const dx_after_one = Math.abs(target.x - after_one.x);
		expect(dx_after_one).toBeLessThan(initial_dx);

		for (let i = 0; i < 30; i++) sim.tick();
		const final_v = sim.w.query([pos_c, visual_pos_c, player_c] as const).collect()[0]![2];
		expect(final_v.x).toBe(target.x);
		expect(final_v.y).toBe(target.y);
	});
});
