import type { System } from "@f0rbit/forge";
import { Container, Text } from "pixi.js";
import { camera_shake_r, hitstop_r, particles_r, wave_r } from "../resources.ts";

const LABEL_STYLE = {
	fontFamily: "monospace",
	fontSize: 8,
	fill: 0xffffff,
	stroke: { color: 0x000000, width: 2 },
} as const;

const LINE_HEIGHT = 10;
const MARGIN = 4;

/**
 * Debug HUD overlay — renders per-tick state on `app.render.debug_overlay` (the
 * unfiltered container per echo AGENTS.md "Rendering conventions"). Children
 * here render at full brightness regardless of the lighting filter state.
 *
 * Lines:
 *   hitstop       N
 *   shake.mag     X.XX
 *   particles     N
 *   wave          N/M   kills K
 *
 * Toggleable via Tab key (`debug_toggle` digital binding in bindings.ts). The
 * Tab toggle flips a closure-local boolean so this fixture stays free of new
 * resources (out of scope per Phase 3.6).
 *
 * Crisp text: `resolution: 4` only — parent is `app.render.debug_overlay`
 * (canvas-pixel space, no container scale). No `scale.set(0.5)` needed. See
 * AGENTS.md "Crisp text recipe" (Phase 5.9.5).
 */
export const make_debug_overlay_system = (parent: Container): System => {
	const container = new Container();
	container.label = "ar.debug_overlay";
	container.zIndex = 9999;
	parent.addChild(container);

	const lines: Text[] = [];
	const acquire_line = (idx: number): Text => {
		const existing = lines[idx];
		if (existing) return existing;
		const t = new Text({ text: "", style: LABEL_STYLE, resolution: 4 });
		t.position.set(MARGIN, MARGIN + idx * LINE_HEIGHT);
		container.addChild(t);
		lines[idx] = t;
		return t;
	};

	let visible = true;

	return (_w, ctx) => {
		if (ctx.input.just("debug_toggle")) {
			visible = !visible;
			container.visible = visible;
		}
		if (!visible) return;

		const hs = ctx.res.get(hitstop_r);
		const shake = ctx.res.get(camera_shake_r);
		const p = ctx.res.get(particles_r);
		const wave = ctx.res.get(wave_r);

		const hs_val = hs.ok ? hs.value.remaining : 0;
		const shake_val = shake.ok ? shake.value.magnitude : 0;
		const particle_count = p.ok ? p.value.entries.filter(e => e.ttl > 0).length : 0;
		const wave_cur = wave.ok ? wave.value.current : 0;
		const wave_total = wave.ok ? wave.value.total : 0;
		const kills = wave.ok ? wave.value.total_kills : 0;

		acquire_line(0).text = `hitstop    ${hs_val}`;
		acquire_line(1).text = `shake.mag  ${shake_val.toFixed(2)}`;
		acquire_line(2).text = `particles  ${particle_count}`;
		acquire_line(3).text = `wave       ${wave_cur}/${wave_total}  kills ${kills}  [Tab to toggle]`;
	};
};
