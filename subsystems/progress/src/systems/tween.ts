// tween.ts — copy of loot/systems/tween.ts (which was copied from
// bestiary). Lerps visual_pos_c toward pos_c each tick so cell-step
// movement looks continuous.
//
// NOT gated on `progress_r.paused` — visuals catch up smoothly even
// during the level-up pause; nothing surprising happens because pos_c
// stops changing while gameplay systems are gated.
import type { System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { visual_pos_c } from "../components.ts";

const smoothing = 0.3;
const snap_threshold = 0.5;

export const tween_step_system: System = (w) => {
	for (const [id, vis, pos] of w.query([visual_pos_c, pos_c] as const).collect()) {
		const dx = pos.x - vis.x;
		const dy = pos.y - vis.y;
		if (Math.abs(dx) < snap_threshold && Math.abs(dy) < snap_threshold) {
			w.set(id, visual_pos_c, { x: pos.x, y: pos.y });
			continue;
		}
		w.set(id, visual_pos_c, { x: vis.x + dx * smoothing, y: vis.y + dy * smoothing });
	}
};
