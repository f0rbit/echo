import { boot } from "@f0rbit/forge/pixi";
import { Rectangle, Text } from "pixi.js";
import { game_bindings } from "./bindings.ts";
import { visual_pos_c } from "./components.ts";
import { game_plugin } from "./plugin.ts";
import { win_overlay_r } from "./resources.ts";
import { make_light_filter } from "./systems/light.ts";

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

const design = { width: 320, height: 176 };

const main = async (): Promise<void> => {
	const r = await boot({
		mount: "#root",
		window: { width: globalThis.innerWidth, height: globalThis.innerHeight },
		camera: {
			design,
			mode: "extend",
			min: design,
		},
		bindings: game_bindings,
		pos: visual_pos_c,
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
	const light = make_light_filter(design, { ambient: [0.08, 0.04, 0.02], falloff: 1.6 });
	app.render.world.sortableChildren = true;
	const apply_filter_area = (): void => {
		const vp = app.render.viewport();
		app.render.world.filterArea = new Rectangle(0, 0, vp.view.width, vp.view.height);
	};
	apply_filter_area();
	app.render.world.filters = [light.filter];
	game_plugin(app.world, app.schedule, { light });
	globalThis.addEventListener("resize", () => {
		app.render.resize(globalThis.innerWidth, globalThis.innerHeight);
		apply_filter_area();
		overlay.position.set(globalThis.innerWidth / 2, globalThis.innerHeight / 2);
	});
	app.start();
};

main();
