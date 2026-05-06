export const cols = 20;
export const rows = 11;
export const tile = 16;

export const key = (x: number, y: number): number => y * cols + x;

export const unkey = (k: number): { x: number; y: number } => ({
	x: k % cols,
	y: Math.floor(k / cols),
});

export const in_bounds = (x: number, y: number): boolean =>
	x >= 0 && y >= 0 && x < cols && y < rows;

export const cell_to_world = (cx: number, cy: number): { x: number; y: number } => ({
	x: cx * tile + tile / 2,
	y: cy * tile + tile / 2,
});

export const world_to_cell = (wx: number, wy: number): { x: number; y: number } => ({
	x: Math.floor(wx / tile),
	y: Math.floor(wy / tile),
});

export const chebyshev = (ax: number, ay: number, bx: number, by: number): number =>
	Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export const neighbors = (x: number, y: number): ReadonlyArray<{ x: number; y: number }> => [
	{ x: x + 1, y },
	{ x: x - 1, y },
	{ x, y: y + 1 },
	{ x, y: y - 1 },
];
