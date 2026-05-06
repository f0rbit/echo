import { in_bounds, key } from "./grid.ts";

export const fov_radius = 6;

type Octant = { xx: number; xy: number; yx: number; yy: number };

const octants: readonly Octant[] = [
	{ xx: 1, xy: 0, yx: 0, yy: 1 },
	{ xx: 0, xy: 1, yx: 1, yy: 0 },
	{ xx: 0, xy: -1, yx: 1, yy: 0 },
	{ xx: -1, xy: 0, yx: 0, yy: 1 },
	{ xx: -1, xy: 0, yx: 0, yy: -1 },
	{ xx: 0, xy: -1, yx: -1, yy: 0 },
	{ xx: 0, xy: 1, yx: -1, yy: 0 },
	{ xx: 1, xy: 0, yx: 0, yy: -1 },
];

const blocking = (floors: ReadonlySet<number>, x: number, y: number): boolean =>
	!in_bounds(x, y) || !floors.has(key(x, y));

const cast = (
	out: Set<number>,
	floors: ReadonlySet<number>,
	px: number,
	py: number,
	row: number,
	start: number,
	end: number,
	radius: number,
	o: Octant,
): void => {
	if (start < end) return;
	let new_start = start;
	let blocked = false;
	for (let distance = row; distance <= radius && !blocked; distance++) {
		const dy = -distance;
		for (let dx = -distance; dx <= 0; dx++) {
			const cx = px + dx * o.xx + dy * o.xy;
			const cy = py + dx * o.yx + dy * o.yy;
			const l_slope = (dx - 0.5) / (dy + 0.5);
			const r_slope = (dx + 0.5) / (dy - 0.5);
			if (start < r_slope) continue;
			if (end > l_slope) break;
			if (dx * dx + dy * dy <= radius * radius && in_bounds(cx, cy)) {
				if (floors.has(key(cx, cy))) out.add(key(cx, cy));
			}
			if (blocked) {
				if (blocking(floors, cx, cy)) {
					new_start = r_slope;
					continue;
				}
				blocked = false;
				start = new_start;
			} else if (blocking(floors, cx, cy) && distance < radius) {
				blocked = true;
				cast(out, floors, px, py, distance + 1, start, l_slope, radius, o);
				new_start = r_slope;
			}
		}
	}
};

export const visible_keys = (
	px: number,
	py: number,
	floors: ReadonlySet<number>,
): ReadonlySet<number> => {
	const out = new Set<number>();
	if (in_bounds(px, py)) out.add(key(px, py));
	for (const o of octants) cast(out, floors, px, py, 1, 1.0, 0.0, fov_radius, o);
	return out;
};
