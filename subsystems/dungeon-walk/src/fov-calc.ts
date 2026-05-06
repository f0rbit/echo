import { chebyshev, in_bounds, key } from "./grid.ts";

export const fov_radius = 6;

export const visible_keys = (
	px: number,
	py: number,
	floors: ReadonlySet<number>,
): ReadonlySet<number> => {
	const out = new Set<number>();
	for (let dy = -fov_radius; dy <= fov_radius; dy++) {
		for (let dx = -fov_radius; dx <= fov_radius; dx++) {
			const x = px + dx;
			const y = py + dy;
			if (!in_bounds(x, y)) continue;
			if (chebyshev(px, py, x, y) > fov_radius) continue;
			const k = key(x, y);
			if (floors.has(k)) out.add(k);
		}
	}
	return out;
};
