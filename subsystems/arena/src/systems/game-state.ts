import type { Ctx, System, World } from "@f0rbit/forge";
import { setup_arena } from "../arena-gen.ts";
import { fsm, enter } from "../fsm.ts";
import { game_state_r, run_seed_r, wave_r } from "../resources.ts";
import { health_c, player_c } from "../components.ts";

// game-state.ts — pre-stage FSM that owns the menu/playing/won/lost cycle.
// Runs every tick (must not gate on its own state). Mirrors AGENTS.md
// "Game-state gates" pattern: gameplay systems early-return when state !==
// "playing", render-stage systems keep running so the menu/win/lost overlays
// composite over the (now-frozen) world.
//
// Transitions:
//   menu     -> playing  on `start_game` (Space)  → calls setup_arena
//   playing  -> won      when wave_r.current >= wave_r.total && chasers_alive===0
//   playing  -> lost     when player health <= 0
//   won|lost -> menu     on `restart` (R)         → w.clear() + reset resource
//
// enter-playing is the only path that spawns the arena. enter-menu wipes the
// world (so the menu overlay doesn't show a frozen battlefield underneath).
// Restart while playing is handled by restart.ts (legacy in-run reset).

const win_condition = (w: World, ctx: Ctx): boolean => {
	const wave = ctx.res.get(wave_r);
	if (!wave.ok) return false;
	if (wave.value.chasers_alive > 0) return false;
	return wave.value.current >= wave.value.total;
};

const player_dead = (w: World): boolean => {
	for (const [, h] of w.query([player_c, health_c] as const).collect()) {
		return h.current <= 0;
	}
	return false;
};

const enter_playing = (w: World, ctx: Ctx, tick: number): void => {
	w.clear();
	setup_arena(w, ctx);
	const r = ctx.res.get(game_state_r);
	if (r.ok) ctx.res.set(game_state_r, enter(r.value, "playing", tick));
};

const enter_menu = (w: World, ctx: Ctx, tick: number): void => {
	w.clear();
	// Reset run seed so a fresh menu->playing transition starts deterministic
	// from the same base seed as the initial boot.
	const seed = ctx.res.get(run_seed_r);
	const base = seed.ok ? seed.value.base : ctx.rng.seed;
	ctx.res.set(run_seed_r, { base, restart_count: 0 });
	const r = ctx.res.get(game_state_r);
	if (r.ok) ctx.res.set(game_state_r, enter(r.value, "menu", tick));
};

const enter_terminal = (ctx: Ctx, state: "won" | "lost", tick: number): void => {
	const r = ctx.res.get(game_state_r);
	if (r.ok) ctx.res.set(game_state_r, enter(r.value, state, tick));
};

export const make_game_state_system = (): System => (w, ctx) => {
	const gs = ctx.res.get(game_state_r);
	if (!gs.ok) {
		ctx.res.set(game_state_r, fsm<"menu" | "playing" | "won" | "lost">("menu", ctx.time.tick));
		return;
	}
	const state = gs.value.state;
	const tick = ctx.time.tick;

	if (state === "menu") {
		if (ctx.input.just("start_game")) enter_playing(w, ctx, tick);
		return;
	}

	if (state === "playing") {
		if (player_dead(w)) {
			enter_terminal(ctx, "lost", tick);
			return;
		}
		if (win_condition(w, ctx)) {
			enter_terminal(ctx, "won", tick);
			return;
		}
		return;
	}

	// won | lost
	if (ctx.input.just("restart")) enter_menu(w, ctx, tick);
};
