import type { Id, System } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import { pickup_c, player_c } from "../components.ts";
import { g } from "../grid.ts";
import { try_add_item } from "./inventory.ts";

// pickups.ts — walk-over collection (per .plans/loot.md §2 Q6).
//
// Same-cell match: pos_c stores world coords (cell-centered floats, e.g.
// {x: 168, y: 88} for cell 10,5). After g.move_tile the player's pos_c is
// always cell-centered, so we resolve both player + pickup positions back
// to integer cell coords via g.world_to_cell and compare those — robust to
// any floating-point quirks if the harness ever introduces them.
//
// On a hit: try_add_item to the inventory. On success → despawn pickup.
// On failure (inventory full) → leave pickup on the floor so the player
// can collect it later (per task spec).

export const make_pickups_system = (): System => (w, ctx) => {
	let player_id: Id | null = null;
	let player_cell: { x: number; y: number } | null = null;
	for (const [id, pos] of w.query([pos_c, player_c] as const).collect()) {
		player_id = id;
		player_cell = g.world_to_cell(pos.x, pos.y);
		break;
	}
	if (player_id === null || player_cell === null) return;

	for (const [id, pos, pickup] of w.query([pos_c, pickup_c] as const).collect()) {
		const c = g.world_to_cell(pos.x, pos.y);
		if (c.x !== player_cell.x || c.y !== player_cell.y) continue;
		const ok = try_add_item(w, player_id, ctx, pickup.item_id);
		if (ok) w.despawn(id);
	}
};
