import type { Ctx, System, World } from "@f0rbit/forge";
import { pos_c } from "@f0rbit/forge";
import type { Cell } from "@f0rbit/forge/grid";
import {
	dir_c,
	equipment_c,
	floor_c,
	inventory_c,
	pickup_c,
	player_c,
	stats_c,
	visual_pos_c,
	wall_c,
	type Equipment,
} from "./components.ts";
import { g } from "./grid.ts";
import { arena_r, inventory_ui_r, item_registry_r, run_seed_r } from "./resources.ts";
import { BASE_STATS } from "./systems/stats.ts";
import { ITEMS, make_item_registry, type ItemDef } from "./data/items.ts";

// arena-gen — startup: install resources + spawn player + scatter pickups.
//
// Cell-step subsystem (per .plans/loot.md §2 Q1) — player has pos_c (world
// coords, cell-centered) + visual_pos_c (lerp target for smoothing) + dir_c
// (-1/0/1 step direction). Mirrors bestiary, NOT arena's continuous model.
//
// item_registry_r is rehydrated at startup (per §2 Q11). It is static config
// and is not part of any snapshot — restore() relies on `arena-gen` running
// before any system that resolves ItemId → ItemDef.

const PICKUP_MIN = 8;
const PICKUP_MAX = 10;
const PLAYER_SPAWN: Cell = { x: Math.floor(g.cols / 2), y: Math.floor(g.rows / 2) };
const INVENTORY_SLOTS = 12;

const empty_equipment: Equipment = { weapon: null, offhand: null, ring1: null, ring2: null };

// Reserved cells: the player's spawn + its 4 neighbours (so the player
// can step in any direction without immediately colliding with a pickup),
// PLUS every perimeter cell (those are now wall sprites — pickups must
// not land on top of a wall). Wall cells are visual-only (no collision
// change) but a pickup under a wall would be unreachable + invisible.
const reserved_keys = (player: Cell): Set<number> => {
	const reserved = new Set<number>([g.key(player.x, player.y)]);
	for (const n of g.neighbors4(player.x, player.y)) reserved.add(g.key(n.x, n.y));
	for (let cx = 0; cx < g.cols; cx++) {
		reserved.add(g.key(cx, 0));
		reserved.add(g.key(cx, g.rows - 1));
	}
	for (let cy = 0; cy < g.rows; cy++) {
		reserved.add(g.key(0, cy));
		reserved.add(g.key(g.cols - 1, cy));
	}
	return reserved;
};

const pick_pickup_cells = (rng: { next: () => number; int: (lo: number, hi: number) => number }, player: Cell): Cell[] => {
	const reserved = reserved_keys(player);
	const count = rng.int(PICKUP_MIN, PICKUP_MAX);
	const cells: Cell[] = [];
	const used = new Set<number>(reserved);
	let attempts = 0;
	// Sample the inner rectangle directly (cols/rows minus the wall ring)
	// so the rng stream isn't burned discarding perimeter draws. This keeps
	// the per-seed pickup layout deterministic + reproducible.
	while (cells.length < count && attempts < 200) {
		attempts++;
		const x = rng.int(1, g.cols - 2);
		const y = rng.int(1, g.rows - 2);
		const k = g.key(x, y);
		if (used.has(k)) continue;
		used.add(k);
		cells.push({ x, y });
	}
	return cells;
};

// Spawn a floor entity at every cell and a wall entity at perimeter cells.
// Floors are a deterministic, render-only carpet (no AI/collision/replay-state
// reads them); walls are also visual-only here — pickup placement reserves
// perimeter cells so the player still has the full inner rectangle to move on.
// Stable iteration order (y-major, x-minor) keeps entity-IDs deterministic
// across replay runs.
const spawn_tiles = (w: World): void => {
	for (let cy = 0; cy < g.rows; cy++) {
		for (let cx = 0; cx < g.cols; cx++) {
			const p = g.cell_to_world(cx, cy);
			w.spawn([pos_c, p], [floor_c, true]);
		}
	}
	for (let cy = 0; cy < g.rows; cy++) {
		for (let cx = 0; cx < g.cols; cx++) {
			const on_edge = cx === 0 || cx === g.cols - 1 || cy === 0 || cy === g.rows - 1;
			if (!on_edge) continue;
			const p = g.cell_to_world(cx, cy);
			w.spawn([pos_c, p], [wall_c, true]);
		}
	}
};

const spawn_player = (w: World, cell: Cell): void => {
	const wp = g.cell_to_world(cell.x, cell.y);
	w.spawn(
		[player_c, true],
		[pos_c, wp],
		[visual_pos_c, { ...wp }],
		[dir_c, { dx: 0, dy: 0 }],
		[inventory_c, { slots: Array(INVENTORY_SLOTS).fill(null) as (string | null)[] }],
		[equipment_c, { ...empty_equipment }],
		[stats_c, { ...BASE_STATS }],
	);
};

const spawn_pickups = (w: World, cells: readonly Cell[], items: ReadonlyArray<ItemDef>): void => {
	for (let i = 0; i < cells.length; i++) {
		const cell = cells[i]!;
		const def = items[i % items.length]!;
		const wp = g.cell_to_world(cell.x, cell.y);
		w.spawn(
			[pos_c, wp],
			[visual_pos_c, { ...wp }],
			[pickup_c, { item_id: def.id }],
		);
	}
};

export const setup_arena = (w: World, ctx: Ctx): void => {
	ctx.res.set(arena_r, {
		cols: g.cols,
		rows: g.rows,
		width: g.cols * g.tile,
		height: g.rows * g.tile,
	});
	const prev_seed = ctx.res.get(run_seed_r);
	const base = prev_seed.ok ? prev_seed.value.base : ctx.rng.seed;
	const restart_count = prev_seed.ok ? prev_seed.value.restart_count : 0;
	ctx.res.set(run_seed_r, { base, restart_count });
	ctx.res.set(inventory_ui_r, { open: false, selected_slot: null, dirty_stats: false });
	const reg = make_item_registry();
	ctx.res.set(item_registry_r, { items: reg.items as unknown as Map<string, unknown> });

	spawn_tiles(w);
	spawn_player(w, PLAYER_SPAWN);
	const cells = pick_pickup_cells(ctx.rng, PLAYER_SPAWN);
	spawn_pickups(w, cells, ITEMS);
};

export const make_arena_gen_system = (): System => (w, ctx) => {
	setup_arena(w, ctx);
};
