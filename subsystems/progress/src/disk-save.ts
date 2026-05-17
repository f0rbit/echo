import { snapshot_schema, type Snapshot } from "@f0rbit/forge";
import { err, ok, type Result } from "@f0rbit/corpus";

// disk-save.ts — single-slot localStorage transport for snapshot blobs.
// Per .plans/progress.md §2 Q11/Q12: direct JSON.stringify -> localStorage,
// validated on load via forge's `snapshot_schema.safeParse`. The 4-state
// DiskError union is intentionally narrow; a future schema bump (forge
// snapshot v2) will fail safeParse cleanly → `{ kind: "schema_validation" }`
// → main.ts treats as no save → fresh run. No migration code.
//
// The single try/catch wraps the foreign `localStorage` / `JSON.parse`
// calls per ~/.claude/AGENTS.md "permitted try/catch site". All other
// surfaces use Result<T, E>.

const KEY = "echo:progress:save:slot-1";

export type DiskError =
	| { kind: "no_save" }
	| { kind: "parse"; cause: string }
	| { kind: "schema_validation"; issues: readonly string[] }
	| { kind: "browser_storage_unavailable" };

const get_storage = (): Storage | null => {
	const g = globalThis as { localStorage?: Storage };
	return g.localStorage ?? null;
};

export const disk_save = (s: Snapshot): Result<void, DiskError> => {
	const ls = get_storage();
	if (ls === null) return err({ kind: "browser_storage_unavailable" });
	try {
		ls.setItem(KEY, JSON.stringify(s));
		return ok(undefined);
	} catch {
		return err({ kind: "browser_storage_unavailable" });
	}
};

export const disk_load = (): Result<Snapshot, DiskError> => {
	const ls = get_storage();
	if (ls === null) return err({ kind: "browser_storage_unavailable" });
	let raw: string | null;
	try {
		raw = ls.getItem(KEY);
	} catch {
		return err({ kind: "browser_storage_unavailable" });
	}
	if (raw === null) return err({ kind: "no_save" });
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (e) {
		return err({ kind: "parse", cause: (e as Error).message });
	}
	const validated = snapshot_schema.safeParse(parsed);
	if (!validated.success) {
		return err({
			kind: "schema_validation",
			issues: validated.error.issues.map((i) => i.message),
		});
	}
	return ok(validated.data);
};

export const disk_clear = (): Result<void, DiskError> => {
	const ls = get_storage();
	if (ls === null) return err({ kind: "browser_storage_unavailable" });
	try {
		ls.removeItem(KEY);
		return ok(undefined);
	} catch {
		return err({ kind: "browser_storage_unavailable" });
	}
};
