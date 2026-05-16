export type {
	EyeLightConfig,
	FlickerProfile,
	LightHandle,
	LightSpec,
	LightSystem,
	LightSystemConfig,
} from "./system.ts";
export {
	make_eye_follow_system,
	make_light_follow_system,
	make_light_system,
	make_light_update_system,
	make_marker_light_follow_system,
} from "./system.ts";
export { presets } from "./presets.ts";
export type { ScenePreset } from "./presets.ts";
export {
	candle_flicker,
	fluorescent_flicker,
	sine_flicker,
	torch_flicker,
} from "./flicker.ts";
