export type ScenePreset = {
	readonly ambient: readonly [number, number, number];
	readonly default_torch_color: readonly [number, number, number];
	/** Torch radius expressed in grid cells (was pixels in v2). */
	readonly default_torch_radius: number;
};

export const presets: {
	readonly moon_cavern: ScenePreset;
	readonly warm_torch: ScenePreset;
	readonly frostbite: ScenePreset;
	readonly lab: ScenePreset;
	readonly sunset: ScenePreset;
	readonly hellscape: ScenePreset;
} = {
	moon_cavern: {
		ambient: [0.04, 0.04, 0.08],
		default_torch_color: [0.78, 0.85, 1.00],
		default_torch_radius: 6,
	},
	warm_torch: {
		ambient: [0.08, 0.04, 0.02],
		default_torch_color: [1.00, 0.78, 0.42],
		default_torch_radius: 6,
	},
	frostbite: {
		ambient: [0.05, 0.07, 0.10],
		default_torch_color: [0.70, 0.92, 1.00],
		default_torch_radius: 6,
	},
	lab: {
		ambient: [0.10, 0.12, 0.12],
		default_torch_color: [0.65, 1.00, 0.85],
		default_torch_radius: 7,
	},
	sunset: {
		ambient: [0.12, 0.06, 0.05],
		default_torch_color: [1.00, 0.55, 0.30],
		default_torch_radius: 6,
	},
	hellscape: {
		ambient: [0.08, 0.02, 0.02],
		default_torch_color: [1.00, 0.35, 0.15],
		default_torch_radius: 5,
	},
};
