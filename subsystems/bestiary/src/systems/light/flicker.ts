const hash01 = (n: number): number => {
	let x = (n | 0) ^ 0x9e3779b1;
	x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
	x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
	return ((x ^ (x >>> 16)) >>> 0) / 0x100000000;
};

const value_noise_1d = (seed: number, t: number): number => {
	const i = Math.floor(t);
	const f = t - i;
	const a = hash01(seed ^ i);
	const b = hash01(seed ^ (i + 1));
	const u = f * f * (3 - 2 * f);
	return a * (1 - u) + b * u;
};

const fbm3 = (seed: number, t: number): number => {
	let amp = 0.5;
	let freq = 1;
	let sum = 0;
	let norm = 0;
	for (let o = 0; o < 3; o++) {
		sum += value_noise_1d(seed + o * 1013, t * freq) * amp;
		norm += amp;
		amp *= 0.5;
		freq *= 2;
	}
	return sum / norm;
};

export type FlickerOutput = { intensity: number; radius: number };

export const torch_flicker = (
	seed: number,
	t: number,
	amount: number,
): FlickerOutput => {
	const n = fbm3(seed, t * 7.0);
	const intensity = 1 + (n - 0.4) * amount * 2;
	const radius = 1 + (n - 0.5) * amount * 0.6;
	return { intensity, radius };
};

export const candle_flicker = (
	seed: number,
	t: number,
	amount: number,
): FlickerOutput => {
	const n = fbm3(seed, t * 3.0);
	const base = 1 + (n - 0.5) * amount * 1.4;
	const dip_gate = hash01(seed ^ Math.floor(t * 5));
	const dip = dip_gate < 0.05 ? 0.7 : 1.0;
	const intensity = base * dip;
	const radius = 1 + (n - 0.5) * amount * 0.4;
	return { intensity, radius };
};

const fluorescent_pattern = "mmamammmmammamamaaamammma";

export const fluorescent_flicker = (seed: number, t: number): number => {
	const step = Math.floor(t * 10);
	const jitter = Math.floor(hash01(seed) * fluorescent_pattern.length);
	const idx = ((step + jitter) % fluorescent_pattern.length + fluorescent_pattern.length) % fluorescent_pattern.length;
	const ch = fluorescent_pattern[idx]!;
	return (ch.charCodeAt(0) - "a".charCodeAt(0)) / 12.5;
};

export const sine_flicker = (hz: number, amount: number, t: number): number =>
	1 + Math.sin(t * 2 * Math.PI * hz) * amount;
