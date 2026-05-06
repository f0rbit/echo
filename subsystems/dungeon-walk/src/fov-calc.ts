import { chebyshev, in_bounds, key } from "./grid.ts";

export const fov_radius = 6;

const is_floor = (floors: ReadonlySet<number>, x: number, y: number): boolean =>
	in_bounds(x, y) && floors.has(key(x, y));

const line_clear = (
	floors: ReadonlySet<number>,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
): boolean => {
	let x = x0;
	let y = y0;
	const dx = Math.abs(x1 - x0);
	const dy = Math.abs(y1 - y0);
	const sx = x0 < x1 ? 1 : -1;
	const sy = y0 < y1 ? 1 : -1;
	let err = dx - dy;
	while (x !== x1 || y !== y1) {
		const e2 = 2 * err;
		if (e2 > -dy) {
			err -= dy;
			x += sx;
		}
		if (e2 < dx) {
			err += dx;
			y += sy;
		}
		if (x === x1 && y === y1) break;
		if (!is_floor(floors, x, y)) return false;
	}
	return true;
};

export const visible_keys = (
	px: number,
	py: number,
	floors: ReadonlySet<number>,
): ReadonlySet<number> => {
	const out = new Set<number>();
	if (!in_bounds(px, py)) return out;
	out.add(key(px, py));
	for (let dy = -fov_radius; dy <= fov_radius; dy++) {
		for (let dx = -fov_radius; dx <= fov_radius; dx++) {
			if (dx === 0 && dy === 0) continue;
			const tx = px + dx;
			const ty = py + dy;
			if (!in_bounds(tx, ty)) continue;
			if (chebyshev(px, py, tx, ty) > fov_radius) continue;
			if (!is_floor(floors, tx, ty)) continue;
			if (line_clear(floors, px, py, tx, ty)) out.add(key(tx, ty));
		}
	}
	return out;
};
