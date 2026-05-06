import { boot } from "@f0rbit/forge/pixi";
import { presets } from "@f0rbit/forge/presets";
import { Text } from "pixi.js";
import { game_plugin } from "./plugin.ts";
import { win_overlay_r } from "./resources.ts";

const make_overlay = (width: number, height: number): Text => {
	const text = new Text({
		text: "You reached the exit!\nPress R to restart",
		style: {
			fontFamily: "monospace",
			fontSize: 32,
			fill: 0xffffff,
			align: "center",
			stroke: { color: 0x000000, width: 4 },
		},
	});
	text.anchor.set(0.5);
	text.position.set(width / 2, height / 2);
	text.visible = false;
	return text;
};

const main = async (): Promise<void> => {
	const r = await boot({
		mount: "#root",
		window: { width: globalThis.innerWidth, height: globalThis.innerHeight },
		camera: {
			design: { width: 320, height: 180 },
			mode: "extend",
			min: { width: 320, height: 180 },
		},
		bindings: presets.movement2d,
	});
	if (!r.ok) {
		console.error("boot failed", r.error);
		return;
	}
	const app = r.value;
	const overlay = make_overlay(globalThis.innerWidth, globalThis.innerHeight);
	app.app.stage.addChild(overlay);
	app.res.set(win_overlay_r, {
		show: (visible: boolean) => {
			overlay.visible = visible;
		},
	});
	game_plugin(app.world, app.schedule);
	globalThis.addEventListener("resize", () => {
		app.render.resize(globalThis.innerWidth, globalThis.innerHeight);
		overlay.position.set(globalThis.innerWidth / 2, globalThis.innerHeight / 2);
	});
	app.start();
};

main();
