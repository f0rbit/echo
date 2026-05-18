import type { Component, Ctx, System, World } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { sprite_c } from "@f0rbit/forge/pixi";
import { floor_c, pickup_c, player_c } from "../components.ts";
import { item_registry_r } from "../resources.ts";
import type { ItemDef, ItemId, ItemRegistry } from "../data/items.ts";

// sprite-attach.ts — mirror of bestiary's pattern. Each entity that has a
// supported marker component (and pos_c) gets a sprite_c written exactly once;
// forge's auto-installed sprite_sync_system then renders it. Pickups are not
// in the static marker table because every pickup frame is per-item — they
// resolve via the item_registry_r lookup.

type Tile = {
	marker: Component<true>;
	texture: string;
	frame: string;
	visible: boolean;
	anchor: { x: number; y: number };
	z?: number;
};

const tiles: readonly Tile[] = [
	{ marker: floor_c, texture: "dungeon", frame: "floor_1", visible: true, anchor: { x: 0.5, y: 0.5 }, z: 1 },
	{ marker: player_c, texture: "dungeon", frame: "knight_m_idle_anim_f0", visible: true, anchor: { x: 0.5, y: 0.75 }, z: 3 },
];

const attach_marker_sprites = (w: World): void => {
	for (const { marker, texture, frame, visible, anchor, z } of tiles) {
		for (const [id] of w.query([pos_c, marker] as const)) {
			if (w.has(id, sprite_c)) continue;
			w.set(id, sprite_c, { texture, frame, anchor, visible, z });
		}
	}
};

const attach_pickup_sprites = (w: World, ctx: Ctx): void => {
	const reg_r = ctx.res.get(item_registry_r);
	if (!reg_r.ok) return;
	const reg = reg_r.value as unknown as ItemRegistry;
	for (const [id, , pickup] of w.query([pos_c, pickup_c] as const)) {
		if (w.has(id, sprite_c)) continue;
		const def = (reg.items.get(pickup.item_id as ItemId) ?? null) as ItemDef | null;
		if (!def) continue;
		w.set(id, sprite_c, {
			texture: "dungeon",
			frame: def.frame,
			anchor: { x: 0.5, y: 0.5 },
			visible: true,
			z: 2,
		});
	}
};

export const sprite_attach_system: System = (w, ctx) => {
	attach_marker_sprites(w);
	attach_pickup_sprites(w, ctx);
};
