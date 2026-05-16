import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Frame = {
	frame: { x: number; y: number; w: number; h: number };
	sourceSize: { w: number; h: number };
	spriteSourceSize: { x: number; y: number; w: number; h: number };
};

type AtlasJson = {
	frames: Record<string, Frame>;
	meta: { image: string; size: { w: number; h: number } };
};

const SRC_LIST = "/tmp/0x72-tileset/0x72_DungeonTilesetII_v1.7/tile_list_v1.7";
const ATLAS_W = 512;
const ATLAS_H = 512;
const IMAGE_REF = "dungeon-atlas.png";

const out_targets: readonly string[] = [
	"/Users/tom/dev/echo/subsystems/bestiary/public/dungeon-atlas.json",
	"/Users/tom/dev/echo/subsystems/dungeon-walk/public/dungeon-atlas.json",
];

const parse_line = (line: string): [string, Frame] | null => {
	const parts = line.trim().split(/\s+/);
	if (parts.length !== 5) return null;
	const [name, xs, ys, ws, hs] = parts as [string, string, string, string, string];
	const x = Number(xs);
	const y = Number(ys);
	const w = Number(ws);
	const h = Number(hs);
	if ([x, y, w, h].some(n => !Number.isFinite(n))) return null;
	return [name, {
		frame: { x, y, w, h },
		sourceSize: { w, h },
		spriteSourceSize: { x: 0, y: 0, w, h },
	}];
};

const main = (): void => {
	const list_text = readFileSync(SRC_LIST, "utf8");
	const frames: Record<string, Frame> = {};
	let count = 0;
	for (const line of list_text.split(/\r?\n/)) {
		if (!line.trim()) continue;
		const parsed = parse_line(line);
		if (!parsed) {
			console.warn(`skip unparsable line: ${line}`);
			continue;
		}
		const [name, frame] = parsed;
		frames[name] = frame;
		count++;
	}

	const atlas: AtlasJson = {
		frames,
		meta: { image: IMAGE_REF, size: { w: ATLAS_W, h: ATLAS_H } },
	};

	const json = JSON.stringify(atlas, null, "\t") + "\n";
	for (const path of out_targets) {
		writeFileSync(path, json);
		console.log(`wrote ${path} (${count} frames, ${json.length} bytes)`);
	}
};

main();
