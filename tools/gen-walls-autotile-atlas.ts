import { writeFileSync } from "node:fs";

type Frame = {
	frame: { x: number; y: number; w: number; h: number };
	sourceSize: { w: number; h: number };
	spriteSourceSize: { x: number; y: number; w: number; h: number };
};

type AtlasJson = {
	frames: Record<string, Frame>;
	meta: { image: string; size: { w: number; h: number } };
};

const TILE = 16;
const COLS = 12;
const ROWS = 4;
const ATLAS_W = COLS * TILE;
const ATLAS_H = ROWS * TILE;
const IMAGE_REF = "walls-autotile.png";

const out_targets: readonly string[] = [
	"/Users/tom/dev/echo/subsystems/bestiary/public/walls-autotile.json",
	"/Users/tom/dev/echo/subsystems/dungeon-walk/public/walls-autotile.json",
];

const build_frames = (): Record<string, Frame> => {
	const frames: Record<string, Frame> = {};
	for (let row = 0; row < ROWS; row++) {
		for (let col = 0; col < COLS; col++) {
			frames[`wat_${col}_${row}`] = {
				frame: { x: col * TILE, y: row * TILE, w: TILE, h: TILE },
				sourceSize: { w: TILE, h: TILE },
				spriteSourceSize: { x: 0, y: 0, w: TILE, h: TILE },
			};
		}
	}
	return frames;
};

const main = (): void => {
	const atlas: AtlasJson = {
		frames: build_frames(),
		meta: { image: IMAGE_REF, size: { w: ATLAS_W, h: ATLAS_H } },
	};
	const json = JSON.stringify(atlas, null, "\t") + "\n";
	for (const path of out_targets) {
		writeFileSync(path, json);
		console.log(`wrote ${path} (${Object.keys(atlas.frames).length} frames, ${json.length} bytes)`);
	}
};

main();
