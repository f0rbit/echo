import { describe, expect, test } from "bun:test";
import type { Id } from "@f0rbit/forge";
import { sprite_c } from "@f0rbit/forge/pixi";
import { flash_c } from "../src/components.ts";
import { hit_events_r } from "../src/resources.ts";
import { make_flash_system } from "../src/systems/flash.ts";
import { make_progress_scenario } from "./fixtures/progress-scenario.ts";

// Mirrors arena/test/flash semantics — per-entity tint flash, attaches
// on hit_event, decays via ticks_remaining, restores original tint on
// expiry. Skips entities without sprite_c.

const make_sim = () => {
	const scenario = make_progress_scenario({ with_player: true });
	const h = scenario.h;
	h.schedule.add("update", make_flash_system(), { phase: 99, name: "flash" });
	return { h, player_id: scenario.player_id! };
};

const push_event_on = (h: ReturnType<typeof make_sim>["h"], target_id: Id): void => {
	const r = h.ctx.res.get(hit_events_r);
	if (!r.ok) throw new Error("hit_events_r missing");
	r.value.events.push({ target_id, x: 0, y: 0, damage: 1 });
};

const clear_events = (h: ReturnType<typeof make_sim>["h"]): void => {
	const r = h.ctx.res.get(hit_events_r);
	if (r.ok) r.value.events = [];
};

const tick = (h: ReturnType<typeof make_sim>["h"]): void => {
	h.time.advance(1 / 60);
	h.schedule.tick(h.world, h.ctx);
};

describe("progress flash", () => {
	test("hit_event with sprite_c attaches flash_c", () => {
		const { h, player_id } = make_sim();
		// scenario doesn't attach sprite_c; do it manually for this test.
		h.world.set(player_id, sprite_c, {
			texture: "dungeon",
			frame: "knight_m_idle_anim_f0",
			tint: 0xff0000,
			visible: true,
			anchor: { x: 0.5, y: 0.5 },
			z: 3,
		});
		push_event_on(h, player_id);
		tick(h);
		const f = h.world.get(player_id, flash_c);
		expect(f.ok).toBe(true);
		if (!f.ok) return;
		// First tick attaches with FLASH_TICKS then immediately decrements
		// (the same-tick decrement is a quirk of running both attach and
		// decrement in one system call). What matters: flash_c exists,
		// original_tint preserved, sprite tinted white.
		expect(f.value.original_tint).toBe(0xff0000);
		const sp = h.world.get(player_id, sprite_c);
		expect(sp.ok).toBe(true);
		if (sp.ok) expect(sp.value.tint).toBe(0xffffff);
	});

	test("hit_event without sprite_c is no-op", () => {
		const { h, player_id } = make_sim();
		// No sprite_c attached.
		push_event_on(h, player_id);
		tick(h);
		const f = h.world.get(player_id, flash_c);
		expect(f.ok).toBe(false);
	});

	test("flash decays and restores original tint on expiry", () => {
		const { h, player_id } = make_sim();
		const ORIG = 0x336699;
		h.world.set(player_id, sprite_c, {
			texture: "dungeon",
			frame: "knight_m_idle_anim_f0",
			tint: ORIG,
			visible: true,
			anchor: { x: 0.5, y: 0.5 },
			z: 3,
		});
		push_event_on(h, player_id);
		tick(h);
		clear_events(h);
		// Advance far past FLASH_TICKS = 9.
		for (let i = 0; i < 15; i++) tick(h);
		const f = h.world.get(player_id, flash_c);
		expect(f.ok).toBe(false);
		const sp = h.world.get(player_id, sprite_c);
		expect(sp.ok).toBe(true);
		if (sp.ok) expect(sp.value.tint).toBe(ORIG);
	});
});
