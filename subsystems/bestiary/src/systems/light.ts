import type { System } from "@f0rbit/forge";
import { Sprite, Texture } from "pixi.js";
import { player_c, visual_pos_c } from "../components.ts";
import { g } from "../grid.ts";
import { fov_radius } from "./fov.ts";

const light_tex_size = 256;

export const make_light_texture = (size: number): Texture => {
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d")!;
	const cx = size / 2;
	const cy = size / 2;
	const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
	gradient.addColorStop(0.0, "rgba(255, 255, 255, 1.0)");
	gradient.addColorStop(0.5, "rgba(180, 180, 200, 1.0)");
	gradient.addColorStop(0.8, "rgba(60, 60, 80, 1.0)");
	gradient.addColorStop(1.0, "rgba(0, 0, 0, 1.0)");
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, size, size);
	return Texture.from(canvas);
};

export const make_light_sprite = (): Sprite => {
	const tex = make_light_texture(light_tex_size);
	const s = new Sprite(tex);
	s.anchor.set(0.5);
	s.blendMode = "multiply";
	s.zIndex = 50;
	return s;
};

export const light_follow_system = (sprite: Sprite): System => (w, _ctx) => {
	const players = w.query([visual_pos_c, player_c] as const).collect();
	if (players.length === 0) {
		sprite.visible = false;
		return;
	}
	const vis = players[0]![1];
	const radius_px = fov_radius * g.tile;
	const cover_px = radius_px * 2 * Math.SQRT2;
	sprite.position.set(vis.x, vis.y);
	sprite.scale.set(cover_px / light_tex_size);
	sprite.visible = true;
};
