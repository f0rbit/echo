import { ok, err, type Result } from "@f0rbit/corpus";
import type { Palette, Snapshotter, World } from "@f0rbit/forge";
import { z } from "zod";
import { chaser_c } from "./components.ts";
import { PERKS } from "./data/perks.ts";
import { disk_clear, disk_load, disk_save } from "./disk-save.ts";
import type { XpSystem } from "./systems/xp.ts";

// palette-cmds.ts — registers the five debug palette commands shipped with
// Phase 5.5 (per .plans/progress.md §5 Phase 5.5):
//
//   /save         — disk_save(snapper.take(...))
//   /load         — disk_load(); snapper.restore(...) on success
//   /perk-list    — log every PerkDef from data/perks.ts
//   /grant-xp <N> — xp_sys.emit_xp_gain(N) cheat (bypasses kills)
//   /kill-all     — despawn every chaser_c entity
//
// All commands return `Result<string, CommandError>` per forge's
// `CommandRunner` contract. The palette UI shows the returned string for
// a few ticks (palette_pixi result line). All side effects go through
// existing closure setters (xp_sys.emit_xp_gain, snapper.take/restore,
// disk_*), so palette commands compose cleanly with the schedule.

export type PaletteCmdsOpts = {
	palette: Palette;
	snapper: Snapshotter;
	world: World;
	xp_sys: XpSystem;
};

export const make_palette_cmds = (opts: PaletteCmdsOpts): void => {
	const { palette, snapper, world, xp_sys } = opts;

	palette.register({
		name: "save",
		desc: "Persist the current world snapshot to localStorage (slot-1)",
		run: (_args, ctx): Result<string, { kind: "runtime"; message: string }> => {
			const snap = snapper.take(world, { time: ctx.time, rng: ctx.rng, res: ctx.res });
			if (!snap.ok) return err({ kind: "runtime", message: `snapshot failed: ${JSON.stringify(snap.error)}` });
			const saved = disk_save(snap.value);
			if (!saved.ok) return err({ kind: "runtime", message: `disk_save: ${saved.error.kind}` });
			return ok("saved");
		},
	});

	palette.register({
		name: "load",
		desc: "Restore the world from the localStorage snapshot (slot-1)",
		run: (_args, ctx): Result<string, { kind: "runtime"; message: string }> => {
			const loaded = disk_load();
			if (!loaded.ok) {
				if (loaded.error.kind === "no_save") return ok("no save");
				return err({ kind: "runtime", message: `disk_load: ${loaded.error.kind}` });
			}
			const res = snapper.restore(world, loaded.value, { time: ctx.time, rng: ctx.rng, res: ctx.res });
			if (!res.ok) return err({ kind: "runtime", message: `restore failed: ${JSON.stringify(res.error)}` });
			return ok("loaded");
		},
	});

	palette.register({
		name: "perk-list",
		desc: "List every perk in the registry (id, name, modifier)",
		run: (): Result<string, never> => {
			const lines = PERKS.map((p) => `${p.id} — ${p.name} — ${JSON.stringify(p.modifier)}`);
			for (const l of lines) console.log(l); // non-deterministic-ok: debug palette command
			return ok(`${lines.length} perks`);
		},
	});

	palette.register({
		name: "grant-xp",
		desc: "Cheat: emit an xp_gain event of N (bypasses kills)",
		args: z.tuple([z.number().int().positive()]),
		run: ([amount]): Result<string, never> => {
			xp_sys.emit_xp_gain(amount);
			return ok(`granted ${amount} xp`);
		},
	});

	palette.register({
		name: "kill-all",
		desc: "Despawn every chaser_c entity",
		run: (): Result<string, never> => {
			const ids = world.query([chaser_c] as const).collect().map((row) => row[0]);
			for (const id of ids) {
				world.despawn(id);
			}
			return ok(`killed ${ids.length}`);
		},
	});

	palette.register({
		name: "save-clear",
		desc: "Erase the localStorage save slot (slot-1)",
		run: (): Result<string, { kind: "runtime"; message: string }> => {
			const cleared = disk_clear();
			if (!cleared.ok) return err({ kind: "runtime", message: `disk_clear: ${cleared.error.kind}` });
			return ok("cleared");
		},
	});
};
