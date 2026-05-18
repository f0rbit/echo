import { writeFileSync } from "node:fs";
import { harness, pos_c, replay } from "@f0rbit/forge";
import { game_bindings } from "../src/bindings.ts";
import { chaser_c, health_c, player_c } from "../src/components.ts";
import { wave_r } from "../src/resources.ts";
import { game_plugin } from "../src/plugin.ts";

/**
 * Scripted-input recorder that clears all 3 waves at seed 1.
 *
 * Hybrid strategy:
 *  - Base behaviour: stationary, rotate facing through 8 cardinal+diagonal
 *    directions on a 32-tick cycle (1 active axis tick per 4-tick phase to
 *    update dir_vec_c, 3 idle ticks). Player stays near center while melee
 *    and ranged spam fires aim across all 8 outward directions.
 *  - Emergency dodge: if the nearest chaser is within DANGER_RADIUS, override
 *    the current axis with a flee-axis (one-tick pulse along the away-from-
 *    chaser vector). This briefly bumps the player away to avoid contact.
 *  - Spam fire: melee/ranged press/release every 2 ticks; cooldowns gate.
 *
 * Replay determinism preserved — recorder reads only deterministic world
 * state (seeded sim, fixed-dt schedule) and emits deterministic input events
 * at deterministic ticks.
 */

const SEED = 1;
const FIXED_DT = 1 / 60;
const SAFETY_CAP = 8000;
const PHASE_LEN = 4;
const DANGER_RADIUS_SQ = 16 * 16;
const ARENA_W = 320;
const ARENA_H = 180;
const EDGE_BUFFER = 16;

type Step = -1 | 0 | 1;
const SIGN = (n: number): Step => (n > 0 ? 1 : n < 0 ? -1 : 0);

const DIRS: readonly { dx: Step; dy: Step }[] = [
	{ dx: 1, dy: 0 },
	{ dx: 1, dy: 1 },
	{ dx: 0, dy: 1 },
	{ dx: -1, dy: 1 },
	{ dx: -1, dy: 0 },
	{ dx: -1, dy: -1 },
	{ dx: 0, dy: -1 },
	{ dx: 1, dy: -1 },
];

const h = harness({ seed: SEED, fixed_dt: FIXED_DT, bindings: game_bindings });
const recorder = replay.record(h.input, h.ctx, { seed: SEED });

game_plugin(h.world, h.schedule);

// Tick 1: boot tick. game_state_system seeds game_state_r = menu and returns
// without spawning anything. No inputs injected.
h.time.advance(FIXED_DT);
h.schedule.tick(h.world, h.ctx);

// Tick 2: emit `start_game` press → menu->playing transition fires this tick,
// setup_arena spawns the world. No combat inputs yet — those start tick 3.
h.input.inject_actions([{ kind: "press", action: "start_game" }]);
h.time.advance(FIXED_DT);
h.schedule.tick(h.world, h.ctx);
// Release start_game on the next advance so it doesn't latch.
h.input.inject_actions([{ kind: "release", action: "start_game" }]);

let cur_dx: Step = 0;
let cur_dy: Step = 0;
let melee_held = false;
let ranged_held = false;
let cleared_at_tick = -1;

const set_axis = (next_dx: Step, next_dy: Step): void => {
	if (next_dx !== cur_dx) {
		h.input.inject_actions([{ kind: "axis", action: "move.x", value: next_dx }]);
		cur_dx = next_dx;
	}
	if (next_dy !== cur_dy) {
		h.input.inject_actions([{ kind: "axis", action: "move.y", value: next_dy }]);
		cur_dy = next_dy;
	}
};

const pulse_melee = (): void => {
	if (melee_held) {
		h.input.inject_actions([{ kind: "release", action: "melee" }]);
		melee_held = false;
	} else {
		h.input.inject_actions([{ kind: "press", action: "melee" }]);
		melee_held = true;
	}
};

const pulse_ranged = (): void => {
	if (ranged_held) {
		h.input.inject_actions([{ kind: "release", action: "ranged" }]);
		ranged_held = false;
	} else {
		h.input.inject_actions([{ kind: "press", action: "ranged" }]);
		ranged_held = true;
	}
};

const player_state = (): { x: number; y: number; hp: number } | null => {
	for (const [, p, hc] of h.world.query([player_c, pos_c, health_c] as const).collect()) {
		return { x: p.x, y: p.y, hp: hc.current };
	}
	return null;
};

const nearest_chaser = (px: number, py: number): { x: number; y: number; dist_sq: number } | null => {
	let best: { x: number; y: number; dist_sq: number } | null = null;
	for (const [, p] of h.world.query([chaser_c, pos_c] as const).collect()) {
		const dx = p.x - px;
		const dy = p.y - py;
		const d2 = dx * dx + dy * dy;
		if (!best || d2 < best.dist_sq) best = { x: p.x, y: p.y, dist_sq: d2 };
	}
	return best;
};

const flee_axis = (px: number, py: number, cx: number, cy: number): { dx: Step; dy: Step } => {
	let dx: Step = SIGN(px - cx);
	let dy: Step = SIGN(py - cy);
	if (px <= EDGE_BUFFER && dx < 0) dx = 0;
	if (px >= ARENA_W - EDGE_BUFFER && dx > 0) dx = 0;
	if (py <= EDGE_BUFFER && dy < 0) dy = 0;
	if (py >= ARENA_H - EDGE_BUFFER && dy > 0) dy = 0;
	if (dx === 0 && dy === 0) {
		// Cornered: slide along the wall perpendicular to the chaser approach.
		dx = SIGN(py - cy) as Step;
		if (dx === 0) dx = 1;
	}
	return { dx, dy };
};

for (let i = 0; i < SAFETY_CAP; i++) {
	const tick = h.time.tick;
	const player = player_state();
	if (!player) throw new Error(`player vanished at tick ${tick}`);

	const target = nearest_chaser(player.x, player.y);
	const danger = target !== null && target.dist_sq < DANGER_RADIUS_SQ;

	if (danger && target) {
		// Override stationary rotation: pulse flee axis every tick to keep
		// moving away as long as the chaser is in danger range.
		const { dx, dy } = flee_axis(player.x, player.y, target.x, target.y);
		set_axis(dx, dy);
	} else {
		const phase_idx = Math.floor(tick / PHASE_LEN) % DIRS.length;
		const phase_pos = tick % PHASE_LEN;
		const dir = DIRS[phase_idx]!;
		if (phase_pos === 0) set_axis(dir.dx, dir.dy);
		else if (phase_pos === 1) set_axis(0, 0);
	}

	if (tick % 2 === 0) pulse_melee();
	else pulse_melee();
	if (tick % 2 === 0) pulse_ranged();
	else pulse_ranged();

	h.time.advance(FIXED_DT);
	h.schedule.tick(h.world, h.ctx);

	const wave = h.ctx.res.get(wave_r);
	if (wave.ok && wave.value.total_kills >= 15 && wave.value.chasers_alive === 0) {
		cleared_at_tick = h.time.tick;
		break;
	}

	const ps = player_state();
	if (!ps || ps.hp <= 0) {
		const w = h.ctx.res.get(wave_r);
		throw new Error(`player died at tick ${h.time.tick} (kills=${w.ok ? w.value.total_kills : "?"})`);
	}
}

const wave_end = h.ctx.res.get(wave_r);
if (!wave_end.ok) throw new Error("wave_r missing");
if (wave_end.value.total_kills < 15 || wave_end.value.chasers_alive !== 0) {
	throw new Error(
		`wave clear failed: total_kills=${wave_end.value.total_kills} chasers_alive=${wave_end.value.chasers_alive} current=${wave_end.value.current}`,
	);
}

set_axis(0, 0);
if (melee_held) pulse_melee();
if (ranged_held) pulse_ranged();
h.time.advance(FIXED_DT);
h.schedule.tick(h.world, h.ctx);

const doc = recorder.stop();
const json = replay.save(doc);
const out_path = new URL("../replays/wave-clear.replay.json", import.meta.url).pathname;
writeFileSync(out_path, json + "\n");

console.log(
	`recorded ${doc.frames.length} frames; cleared at tick ${cleared_at_tick}; total_kills=${wave_end.value.total_kills} wave.current=${wave_end.value.current} -> ${out_path}`,
);
