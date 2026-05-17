# Forge lighting promotion — promote `subsystems/<name>/src/systems/light/` to `@f0rbit/forge/light` (v0.4.0)

## §1 — Goals & non-goals

### Goals

- Promote the 5-file unified-grid lighting module from echo into a new public subpath on `@f0rbit/forge`.
- Publish forge **v0.4.0** to npm via the existing OIDC trusted-publishing workflow.
- Migrate both echo consumers (`bestiary`, `dungeon-walk`) off the local copy and onto `@f0rbit/forge/light`.
- Delete the local `subsystems/<name>/src/systems/light/` directories and the duplicated `light-flicker.test.ts` files in each subsystem (forge owns the test surface now).
- Preserve replay-hash invariants in both subsystems (lighting is render-only — replay bytes must not move).
- Keep both subsystems' bundles smaller after the migration (light module no longer duplicated in each).

### Non-goals

- No backwards-compat shim in forge for the old import path. Both consumers are owned; we bump and migrate atomically.
- No API surface change. The names exported from `@f0rbit/forge/light` match the names exported from `subsystems/<name>/src/systems/light/index.ts` exactly.
- No new pixi peer-dep entry. `pixi.js` is already declared as an optional peer; the new subpath reuses it.
- No automated forge→echo dependency-bump bot. Manual `bun install` in each subsystem.
- No re-record of replay fixtures. We expect byte-identical replays; if the hash moves, **stop and escalate**, do not silently re-record.

---

## §2 — Subpath layout & exports

### Subpath name

**`./light`** (singular, mirrors echo's local folder name and the terseness of `./grid`, `./pixi`). Chosen over `./lighting` for consistency with `./grid` / `./pixi` / `./debug`.

### CRITICAL — directory placement under `src/pixi/`, not `src/light/`

Forge's `AGENTS.md` (`/Users/tom/dev/forge/AGENTS.md` L19) hard-rules:

> `src/pixi/` is the **only** directory allowed to import `pixi.js` or `@pixi/*`.

And `tools/no-throws.ts` enforces this with a regex (`tools/no-throws.ts:18`) that fails CI on any non-`src/pixi/` file matching `from "pixi.js"` or `from "@pixi/..."`. The light system imports `BufferImageSource`, `Filter`, `GlProgram`, `GpuProgram`, `UniformGroup` directly from `pixi.js` — so it **must** live under `src/pixi/`.

The `exports` map decouples URL from filesystem layout. We mount the new subpath at URL `./light` but point it at `dist/pixi/light/index.js`:

```jsonc
// forge package.json (final)
"exports": {
  ".":         { "types": "./dist/index.d.ts",         "import": "./dist/index.js" },
  "./pixi":    { "types": "./dist/pixi/index.d.ts",    "import": "./dist/pixi/index.js" },
  "./debug":   { "types": "./dist/debug/index.d.ts",   "import": "./dist/debug/index.js" },
  "./storage": { "types": "./dist/storage/index.d.ts", "import": "./dist/storage/index.js" },
  "./presets": { "types": "./dist/presets/index.d.ts", "import": "./dist/presets/index.js" },
  "./grid":    { "types": "./dist/grid/index.d.ts",    "import": "./dist/grid/index.js" },
  "./light":   { "types": "./dist/pixi/light/index.d.ts", "import": "./dist/pixi/light/index.js" }
}
```

Consumers see `@f0rbit/forge/light`. Forge's internal layout is `src/pixi/light/`. No determinism-rule waiver needed.

### Filesystem layout under forge

```
forge/src/pixi/light/
├── index.ts        # public re-export barrel (copied verbatim from echo's index.ts)
├── flicker.ts      # pure deterministic flicker math (no forge / no pixi deps)
├── presets.ts      # palette cookbook (no deps)
├── shaders.ts      # GLSL + WGSL string builders (no deps)
└── system.ts       # make_light_system, follow systems, types (pixi.js + ../../grid + ../../world)
```

### tsconfig.json paths

No edit needed. Existing `paths: { "@forge/*": ["./src/*"] }` already covers `@forge/pixi/light/*`. The build uses module-resolution against the source tree; `dist/` is the deliverable.

### rolldown.config.ts

Add one entry to the multi-entry config at `/Users/tom/dev/forge/rolldown.config.ts:30`:

```ts
export default defineConfig([
  entry("index",         "src/index.ts"),
  entry("pixi/index",    "src/pixi/index.ts"),
  entry("debug/index",   "src/debug/index.ts"),
  entry("storage/index", "src/storage/index.ts"),
  entry("presets/index", "src/presets/index.ts"),
  entry("grid/index",    "src/grid/index.ts"),
  entry("pixi/light/index", "src/pixi/light/index.ts"),  // NEW
]);
```

Output filename `dist/pixi/light/index.js` matches the `exports` map above. The existing `external` rules (`pixi.js`, `@pixi/*` regex, `@f0rbit/corpus`, `zod`) already cover everything the light subpath needs.

### tsconfig.build.json

No edit needed. `emitDeclarationOnly: true` over `src/**/*` already emits `dist/pixi/light/index.d.ts` from `src/pixi/light/index.ts`.

---

## §3 — Import-path translation table

The light module copied from `subsystems/bestiary/src/systems/light/` has these forge imports at the top of `system.ts:1–9`:

```ts
import type { Component, Ctx, Id, System, World } from "@f0rbit/forge";
import type { Cell, Grid } from "@f0rbit/forge/grid";
import { BufferImageSource, Filter, GlProgram, GpuProgram, UniformGroup } from "pixi.js";
import { candle_flicker, fluorescent_flicker, sine_flicker, torch_flicker } from "./flicker.ts";
import { make_shaders } from "./shaders.ts";
```

When relocated to `src/pixi/light/system.ts`, those imports translate as:

| Original (in echo) | Translated (in forge `src/pixi/light/`) | Rationale |
|---|---|---|
| `import type { Component, Ctx, Id, System, World } from "@f0rbit/forge";` | `import type { Component, Id, World } from "../../world.ts";` + `import type { Ctx, System } from "../../schedule.ts";` | Internal relative paths. Verify `Ctx` and `System` live in `schedule.ts` (see `src/pixi/index.ts:7–8` for confirmation). |
| `import type { Cell, Grid } from "@f0rbit/forge/grid";` | `import type { Cell, Grid } from "../../grid/index.ts";` | Internal relative path to grid barrel. |
| `import { BufferImageSource, Filter, GlProgram, GpuProgram, UniformGroup } from "pixi.js";` | **unchanged** | `src/pixi/light/` is permitted to import pixi (AGENTS.md L19). |
| `import { ... } from "./flicker.ts";` | **unchanged** | Sibling file. |
| `import { make_shaders } from "./shaders.ts";` | **unchanged** | Sibling file. |

`flicker.ts`, `presets.ts`, `shaders.ts` have **no** forge / pixi imports — they copy verbatim with zero edits.

`index.ts` has no external imports — only `./system.ts`, `./presets.ts`, `./flicker.ts` re-exports. Copies verbatim with zero edits.

### Identical-copy verification

`diff -rq /Users/tom/dev/echo/subsystems/bestiary/src/systems/light/ /Users/tom/dev/echo/subsystems/dungeon-walk/src/systems/light/` returns empty (confirmed in plan grounding). Either copy is the canonical source; use bestiary.

---

## §4 — Forge test additions

New test file: `/Users/tom/dev/forge/test/pixi/light.test.ts` (mirrors forge's `test/pixi/` layout for pixi-coupled tests).

### Coverage matrix

| Test name | What it asserts | Why |
|---|---|---|
| `torch_flicker is pure given (seed, t, amount)` | Same inputs → same intensity & radius | Determinism contract |
| `candle_flicker is pure given (seed, t, amount)` | Same | Determinism |
| `fluorescent_flicker steps at 10 Hz` | (seed, 0.05) === (seed, 0.099), (seed, 0.099) !== (seed, 0.101) | Quantisation invariant |
| `sine_flicker matches closed form` | 1 + sin(t·2π·hz)·amount | Pure formula |
| `torch_flicker intensity in roughly [0.7, 1.3] over 200 samples` | bounded | Range invariant |
| `torch_flicker varies with t` | f(s,0) !== f(s,1) | Non-trivial |
| `torch_flicker varies with seed` | f(1,0.5) !== f(2,0.5) | Seed-sensitivity |
| `presets cookbook has all 6 entries with expected shape` | `moon_cavern`, `warm_torch`, `frostbite`, `lab`, `sunset`, `hellscape` each have `ambient: [3]`, `default_torch_color: [3]`, `default_torch_radius: number` | Surface lock |
| `make_light_system returns a LightSystem with expected properties` | Properties: `filter`, `eye_handle`, `add`, `remove`, `set_pos`, `set_intensity`, `set_color`, `set_ambient`, `update` | API stability |
| `make_light_system: eye_handle.id is 0` | First slot is always the eye | Slot-ordering invariant |
| `make_light_system: add() returns increasing handles` | Two adds → id=1, id=2 | Linear slot allocation |
| `make_light_system: remove() of non-tail swap-pops` | Add A,B,C; remove A; B's new id reflects swap | Internal contract |

`make_light_system` instantiation requires a `Grid` and `pixi.js` runtime classes (`Filter`, `BufferImageSource`, etc.). Forge already runs pixi in tests (see `test/pixi/`). The grid argument: use `grid({ cols: 8, rows: 8, tile: 16 })` from `../../src/grid/index.ts`.

### Existing flicker test in echo

`subsystems/bestiary/test/light-flicker.test.ts` and `subsystems/dungeon-walk/test/light-flicker.test.ts` are byte-identical to each other. Their assertions are folded into the new forge test verbatim (lines 9–56 cover 6 of the 7 flicker tests above; we add `torch_flicker varies with seed` for completeness).

### Determinism-script considerations

The light module contains no `Date.now`, `Math.random`, `setTimeout`, `setInterval`, `throw`, or `try {` (verified by reading `system.ts`, `flicker.ts`, `presets.ts`, `shaders.ts`). Since it lives under `src/pixi/`, `tools/no-throws.ts` would whitelist those rules anyway — but it's clean either way.

---

## §5 — Versioning & publish flow

### Version bump

`/Users/tom/dev/forge/package.json` line 3: `"version": "0.3.3"` → `"version": "0.4.0"`.

### Why minor (not patch)

New public subpath = new public surface. By semver and by forge's existing CHANGELOG convention (`0.3.0` was titled "interface cleanup… Breaking changes are intentional pre-1.0"), additive surface goes in a minor.

### CHANGELOG entry

`/Users/tom/dev/forge/CHANGELOG.md` — insert a new top section before the existing `## 0.3.3`:

```md
## 0.4.0

### Minor Changes

- Add `@f0rbit/forge/light` — unified grid-illumination subpath. Promoted from echo's `bestiary` and `dungeon-walk` subsystems after the 2-consumer threshold was met and the API stabilised across several debugging rounds.

  ```ts
  import {
    make_light_system,
    make_light_update_system,
    make_eye_follow_system,
    make_light_follow_system,
    make_marker_light_follow_system,
    presets,
    candle_flicker,
    fluorescent_flicker,
    sine_flicker,
    torch_flicker,
    type LightSystem,
    type LightSpec,
    type LightHandle,
    type LightSystemConfig,
    type EyeLightConfig,
    type FlickerProfile,
    type ScenePreset,
  } from "@f0rbit/forge/light";
  ```

  - Per-light additive RGB grid accumulator written to a `BufferImageSource`, blended via a Pixi `Filter` with WebGL + WebGPU shader paths.
  - Deterministic flicker profiles (`torch`, `candle`, `fluorescent`, `sine`) — pure functions of `(seed, t)`.
  - Six built-in scene presets (`moon_cavern`, `warm_torch`, `frostbite`, `lab`, `sunset`, `hellscape`).
  - Three convenience follow systems for binding lights to entities (eye-follow, id-follow, marker-follow).
  - `pixi.js` peer dep already declared as optional `^8` — no new peer dep.

  Internally placed under `src/pixi/light/` because the system depends directly on pixi runtime classes (`Filter`, `BufferImageSource`, `GlProgram`, `GpuProgram`, `UniformGroup`); the `./light` URL alias in `exports` keeps the consumer-facing path tidy.

  No breaking changes elsewhere.
```

### Publish flow

The existing workflow at `/Users/tom/dev/forge/.github/workflows/publish.yml` triggers on `push: branches: [main]` (line 4–5) and uses the `npm view` version-diff guard (line 56–67) to publish only when local `package.json` version > published. So:

1. Commit version bump + CHANGELOG + new subpath in one commit on `main`.
2. Push to `origin/main`.
3. CI runs: install → typecheck → test → determinism check → build → conditional publish.
4. Workflow publishes `@f0rbit/forge@0.4.0` via OIDC (no `NPM_TOKEN` needed — `id-token: write` permission on line 9 + npm trusted publisher config).
5. Verify with `npm view @f0rbit/forge versions --json | tail -10` — should list `"0.4.0"`.

**No git tag required** — the workflow is version-bump-driven, not tag-driven. (See `publish.yml:55–66`.)

### Auth / blocker check

OIDC trusted publishing is already configured (the existing 0.3.0–0.3.3 releases used this workflow). No `NPM_TOKEN` secret needed. No new permissions needed. **No blockers**.

---

## §6 — Phase A task list (forge — create `/light` subpath + publish v0.4.0)

All tasks below operate on `/Users/tom/dev/forge/`.

### A1 — Copy source files into new location

- **Files to create**:
  - `/Users/tom/dev/forge/src/pixi/light/index.ts` — copy of `/Users/tom/dev/echo/subsystems/bestiary/src/systems/light/index.ts` verbatim (no edit; only `./system.ts`, `./presets.ts`, `./flicker.ts` re-exports).
  - `/Users/tom/dev/forge/src/pixi/light/flicker.ts` — verbatim copy. Pure math, no deps.
  - `/Users/tom/dev/forge/src/pixi/light/presets.ts` — verbatim copy. Pure data, no deps.
  - `/Users/tom/dev/forge/src/pixi/light/shaders.ts` — verbatim copy. Pure strings, no deps.
  - `/Users/tom/dev/forge/src/pixi/light/system.ts` — copy then edit the two forge-import lines per §3:
    - L1: `@f0rbit/forge` → relative `../../world.ts` + `../../schedule.ts` (split between `Component`/`Id`/`World` and `Ctx`/`System`).
    - L2: `@f0rbit/forge/grid` → `../../grid/index.ts`.
    - L3 `pixi.js` import: unchanged.
- **LOC**: ~370 (~362 verbatim + 2-line edit at top of `system.ts`).
- **Dependencies**: none.
- **Parallelisable**: trivially — single coder, sequential, ~5 min.

### A2 — Add subpath entry to `package.json` exports

- **File**: `/Users/tom/dev/forge/package.json`.
- **Edit**: append `"./light"` to the `exports` map after `"./grid"` (line 48), per §2 snippet.
- **Also**: bump `"version"` line 3 from `"0.3.3"` to `"0.4.0"`.
- **LOC**: 4-line diff.
- **Dependencies**: none (independent of A1 at the file level, but logically follows).
- **Parallelisable**: with A1 (different file).

### A3 — Add rolldown entry

- **File**: `/Users/tom/dev/forge/rolldown.config.ts`.
- **Edit**: append `entry("pixi/light/index", "src/pixi/light/index.ts")` to the array at line 30–37.
- **LOC**: 1-line diff.
- **Dependencies**: A1 (the source file must exist before rolldown can build it).
- **Parallelisable**: with A2.

### A4 — Add CHANGELOG entry

- **File**: `/Users/tom/dev/forge/CHANGELOG.md`.
- **Edit**: insert new `## 0.4.0` section at the top (before `## 0.3.3`), full body per §5.
- **LOC**: ~40 lines.
- **Dependencies**: none.
- **Parallelisable**: with A1, A2, A3.

### A5 — Add forge test

- **File**: `/Users/tom/dev/forge/test/pixi/light.test.ts`.
- **Content**: 12 tests per §4 matrix. ~140 LOC. Mirrors the existing `subsystems/bestiary/test/light-flicker.test.ts` shape (import + `describe` + `test` per `bun:test`).
- **Imports**: `import { ... } from "../../src/pixi/light/index.ts"` and `import { grid } from "../../src/grid/index.ts"`.
- **LOC**: ~140.
- **Dependencies**: A1 (source must exist to import from).
- **Parallelisable**: with A2, A3, A4.

### A6 — Verification

Run from `/Users/tom/dev/forge/`:

```bash
bun install                  # no new deps but lockfile sanity
bun run typecheck            # tsc --noEmit on src + test
bun run check:determinism    # tools/no-throws.ts
bun test                     # bun test — expect existing tests + new light.test.ts green
bun run build                # rolldown + tsc declarations; verify dist/pixi/light/index.{js,d.ts} exist
ls -la dist/pixi/light/
```

Expected: every step green. Build output must include `dist/pixi/light/index.js` and `dist/pixi/light/index.d.ts`.

**LOC**: 0 (verification only).
**Dependencies**: A1–A5 complete.
**Parallelisable**: no — sequential gate.

### A7 — Commit & push

```
feat(light): unified grid-illumination subpath (v0.4.0)

Promote echo's `subsystems/<name>/src/systems/light/` to a first-class
forge subpath at @f0rbit/forge/light. API surface stable across two
consumers (bestiary, dungeon-walk); promotion criterion met.

Internally placed under src/pixi/light/ to respect the
"only src/pixi/ may import pixi.js" invariant. Consumer-facing
URL is /light via the exports map.

CHANGELOG: 0.4.0
```

Then `git push origin main`. CI publishes to npm via OIDC. Verify:

```bash
npm view @f0rbit/forge versions --json | tail -5
```

…lists `"0.4.0"`. Smoke-import in a scratch dir:

```bash
mkdir -p /tmp/forge-light-smoke && cd /tmp/forge-light-smoke
bun init -y && bun add @f0rbit/forge@0.4.0 pixi.js@^8
bun -e 'import("@f0rbit/forge/light").then(m => console.log(Object.keys(m).sort()))'
```

Expected stdout contains `make_light_system`, `presets`, `torch_flicker`, etc.

**LOC**: 0.
**Dependencies**: A6 passed.
**Parallelisable**: no.

### Phase A summary

- 5 file creates, 3 file edits, 1 commit. ~550 LOC total.
- Single coder agent can do this end-to-end; no need for worktree parallelism inside Phase A (the work is mechanical + sequential after A1).
- Verification coder runs A6 + A7.

---

## §7 — Phase B task list (echo — migrate both subsystems to forge/light)

All tasks below operate on `/Users/tom/dev/echo/`.

### B1 — Bump forge dep in both subsystems

- **Files**:
  - `/Users/tom/dev/echo/subsystems/bestiary/package.json` line 16: `"@f0rbit/forge": "^0.3.2"` → `"^0.4.0"`.
  - `/Users/tom/dev/echo/subsystems/dungeon-walk/package.json` line 16: `"@f0rbit/forge": "^0.3.2"` → `"^0.4.0"`.
- **Then**: `bun install` from echo root (refreshes `bun.lockb` for both workspaces).
- **LOC**: 2-line diff.
- **Dependencies**: Phase A complete and `@f0rbit/forge@0.4.0` published.
- **Parallelisable**: trivially — single coder, both edits in one go.

### B2 — Rewrite imports in bestiary

- **Files**:
  - `/Users/tom/dev/echo/subsystems/bestiary/src/main.ts:9`
    - Before: `import { make_light_system, presets } from "./systems/light/index.ts";`
    - After:  `import { make_light_system, presets } from "@f0rbit/forge/light";`
  - `/Users/tom/dev/echo/subsystems/bestiary/src/plugin.ts:24` (multi-line import — verify with `Read` before editing)
    - Before: `} from "./systems/light/index.ts";`
    - After:  `} from "@f0rbit/forge/light";`
- **LOC**: 2-line diff across 2 files.
- **Dependencies**: B1.
- **Parallelisable**: with B3 (different subsystem).

### B3 — Rewrite imports in dungeon-walk

- **Files**:
  - `/Users/tom/dev/echo/subsystems/dungeon-walk/src/main.ts:7`
    - Before: `import { make_light_system, presets } from "./systems/light/index.ts";`
    - After:  `import { make_light_system, presets } from "@f0rbit/forge/light";`
  - `/Users/tom/dev/echo/subsystems/dungeon-walk/src/plugin.ts:5`
    - Before: `import { type LightSystem, make_eye_follow_system, make_light_update_system } from "./systems/light/index.ts";`
    - After:  `import { type LightSystem, make_eye_follow_system, make_light_update_system } from "@f0rbit/forge/light";`
- **LOC**: 2-line diff across 2 files.
- **Dependencies**: B1.
- **Parallelisable**: with B2 (different subsystem).

### B4 — Delete local light folders & duplicated flicker tests

- **Recursively delete**:
  - `/Users/tom/dev/echo/subsystems/bestiary/src/systems/light/`
  - `/Users/tom/dev/echo/subsystems/dungeon-walk/src/systems/light/`
- **Delete files**:
  - `/Users/tom/dev/echo/subsystems/bestiary/test/light-flicker.test.ts`
  - `/Users/tom/dev/echo/subsystems/dungeon-walk/test/light-flicker.test.ts`
- **Sanity grep** before/after — ensure no remaining reference to `"./systems/light"` anywhere:

```bash
rg "systems/light" /Users/tom/dev/echo/subsystems/
# expect: zero results after B4
```

- **LOC**: ~-540 (delete two 5-file copies + two flicker tests).
- **Dependencies**: B2 + B3 complete (no remaining importers).
- **Parallelisable**: yes — purely deletes.

### B5 — Verification

Run from `/Users/tom/dev/echo/`:

```bash
bun install                                     # if not already done in B1
bun -C subsystems/bestiary    run typecheck     # tsc --noEmit on bestiary
bun -C subsystems/dungeon-walk run typecheck     # tsc --noEmit on dungeon-walk
bun test                                         # all subsystem tests, including replay-as-test
bun -C subsystems/bestiary    run build         # static bundle
bun -C subsystems/dungeon-walk run build         # static bundle
```

Expected:

- **Typecheck**: clean for both subsystems.
- **Replay-hash invariants** (most critical — see §8 for the assertion):
  - bestiary replay hash stays `20c9832ca030720900393ef4d8e12473bb120e1b743f7ea4d05896be2263fbf8`.
  - dungeon-walk traverse replay hash stays at its currently-asserted value.
  - If either moves, **STOP** — lighting is render-only and must not affect replay state. Investigate before re-recording.
- **Test counts**:
  - bestiary loses `light-flicker.test.ts` (7 cases). Total test count drops by 7 — confirm forge picked them up symmetrically.
  - dungeon-walk loses `light-flicker.test.ts` (7 cases). Same.
- **Bundle**: both `dist/main.js` should be smaller than pre-change (the ~370-LOC light module is now externalised through the import map). Capture before/after byte counts as a sanity smoke.

**LOC**: 0 (verification only).
**Dependencies**: B1–B4 complete.
**Parallelisable**: no — sequential gate.

### B6 — Commit & push

```
refactor(echo): consume @f0rbit/forge/light v0.4.0; drop local light modules

Both bestiary and dungeon-walk previously shipped a byte-identical
copy of subsystems/<name>/src/systems/light/ (5 files, ~370 LOC each).
Promoted to forge v0.4.0 under @f0rbit/forge/light. Local copies +
duplicated light-flicker tests removed.

Replay hashes unchanged (lighting is render-only).
```

Push to `origin/main`. Pages workflow rebuilds; smoke both deployed subsystems:

```bash
curl -sI https://f0rbit.github.io/echo/bestiary/    | head -1   # expect HTTP/2 200
curl -sI https://f0rbit.github.io/echo/dungeon-walk/ | head -1   # expect HTTP/2 200
```

**LOC**: 0.
**Dependencies**: B5 passed.
**Parallelisable**: no.

### Phase B summary

- 2 package.json edits, 4 source-file import rewrites, 2 directory deletes + 2 test-file deletes, 1 commit. Net ~−540 LOC (deletion-dominant refactor — exactly the point).
- B2 + B3 can run in parallel git worktrees (touch different subsystems). B1 + B4 + B5 + B6 are sequential.

---

## §8 — Verification commands & invariants

### Phase A (forge)

```bash
cd /Users/tom/dev/forge
bun install
bun run typecheck                  # tsc --noEmit
bun run check:determinism          # tools/no-throws.ts
bun test                           # bun test — existing + test/pixi/light.test.ts
bun run build                      # rolldown + tsc declarations
test -f dist/pixi/light/index.js   # build artefact present
test -f dist/pixi/light/index.d.ts # declarations present
```

Then on `main` push, the workflow at `.github/workflows/publish.yml` re-runs the same chain and publishes if `package.json` version > npm-published version.

Post-publish:

```bash
npm view @f0rbit/forge versions --json   # must list "0.4.0"
```

### Phase B (echo)

```bash
cd /Users/tom/dev/echo
bun install
bun -C subsystems/bestiary    run typecheck
bun -C subsystems/dungeon-walk run typecheck
bun test
bun -C subsystems/bestiary    run build
bun -C subsystems/dungeon-walk run build
```

### Replay-hash invariants (critical)

Lighting is a **render-only** subsystem. It writes to a `BufferImageSource` via `update(ctx, is_blocking)` and pushes pixels through a Pixi `Filter`; it never mutates ECS components, rng state, or schedule order. So a clean import-path swap must preserve replay byte-equality.

- **bestiary**: replay hash `20c9832ca030720900393ef4d8e12473bb120e1b743f7ea4d05896be2263fbf8` must remain stable. Asserted in `subsystems/bestiary/test/replay.test.ts` (verify hash text in that file pre-flight).
- **dungeon-walk**: the traverse replay hash asserted in `subsystems/dungeon-walk/test/replay.test.ts` must remain stable.

If either hash moves: **STOP**, do not re-record. Investigate. Possible causes (none expected):

1. A non-determinism leaked in when copying source (unlikely — files are pure).
2. The forge update path imports something that pulls in a Date.now / Math.random transitively (unlikely — `tools/no-throws.ts` would have caught it pre-publish).
3. An export name drifted and a downstream system silently uses a fallback (catch in typecheck, not at runtime).

### Post-deploy smoke

```bash
curl -sI https://f0rbit.github.io/echo/bestiary/     | head -1   # HTTP/2 200
curl -sI https://f0rbit.github.io/echo/dungeon-walk/ | head -1   # HTTP/2 200
```

Then a manual visual smoke (10 seconds each, eyes only — no assertion needed):

- Bestiary: open the URL; confirm torchlight ring around player, ambient dim everywhere else.
- Dungeon-walk: open the URL; confirm FOV + lighting render correctly when player moves.

---

## §9 — Resolved decisions

| Decision | Chosen | Reasoning |
|---|---|---|
| Subpath name: `./light` vs `./lighting` | **`./light`** | Matches echo's local folder name (`systems/light/`); consistent with terseness of `./grid`, `./pixi`, `./debug`. |
| Filesystem placement: `src/light/` vs `src/pixi/light/` | **`src/pixi/light/`** | AGENTS.md L19 + `tools/no-throws.ts` enforce "only `src/pixi/` may import pixi.js". The light system imports `Filter`, `BufferImageSource`, etc. directly. Placing under `src/pixi/light/` respects the invariant without needing a determinism-script waiver. The `exports` map decouples URL (`./light`) from filesystem path. |
| Version bump: patch vs minor vs major | **Minor (0.4.0)** | New public subpath = new public surface. Forge's 0.3.0 CHANGELOG calls breaking changes "intentional pre-1.0" — additive surface is minor. |
| Drop the duplicated `light-flicker.test.ts` from each subsystem? | **Yes — delete both** | Forge now owns the test surface. Keeping the duplicates wastes CI cycles and creates drift risk. The forge test (§4) folds the assertions in verbatim and adds two more. |
| Need a backwards-compat re-export shim (e.g., a deprecated `./systems/light/index.ts` stub in each subsystem)? | **No** | Both consumers are owned, swapped atomically. No external consumers of the local path. Prompt explicitly authorises the breaking change. |
| Forge needs a new pixi peer-dep entry? | **No** | `pixi.js` is already declared as an optional peer in `package.json` (lines 66–73). Optional peer means existing non-pixi consumers stay unaffected; pixi-using consumers (including this new subpath) bring their own. |
| Should `light_uniforms_system` be exported? | **N/A** | The prompt mentions `light_uniforms_system` but the source only exports `make_light_update_system`. Treating "light_uniforms_system" as the prompt's name for the update system. Public surface stays at the names actually present in `system.ts` lines 314–361 (`make_light_update_system`, `make_eye_follow_system`, `make_light_follow_system`, `make_marker_light_follow_system`). |
| Use changesets (`@changesets/cli`) for the version bump? | **No** | Forge's existing CHANGELOG entries appear written directly (not via `changeset version`). To keep the workflow consistent with prior 0.3.x releases, edit `package.json` version + prepend a `## 0.4.0` block to `CHANGELOG.md` manually. Changesets are a tooling-cleanup task for later. |
| Tag the release in git? | **No** | The publish workflow is version-bump-driven (`publish.yml:55–66` compares local vs npm version). No tag step exists. Leave it tag-less for parity with 0.3.x. |
| `subsystems/<name>/test/light-flicker.test.ts` deletion: include in Phase B commit, or separate? | **Same commit as Phase B6** | Atomic refactor — the test only made sense alongside the local source. Single deletion commit is cleanest. |

### Genuinely undecidable (escalate if surfaced)

- **None** in scope of this plan. The prompt left "pick the cleaner name" between `./light` and `./lighting` as the only nominal-discretion item, and that's resolved above.

---

## §10 — Forge promotion bookkeeping

Once Phase B lands and the v0.4.0 publish is confirmed, **flag for orchestrator**: update `/Users/tom/dev/echo/PLAN.md` §5 "Forge bump table (per phase)" (line 495–506).

The current §5 table has:

| Phase 6 | `boss` | **v0.4.0** | `forge.script` scripted-sequence DSL; possibly FSM helper `phase_r` |

…but in reality v0.4.0 is being consumed by **lighting promotion driven by bestiary + dungeon-walk** (Phase 1 / Phase 2 subsystems), not by `boss`. The PLAN's projected version timeline has drifted from reality. Suggested edits:

1. Add a new row above (or annotate existing rows) recording the actual v0.4.0 contents:

   ```md
   | post-Phase 2 | `bestiary` + `dungeon-walk` | **v0.4.0** | `forge/light` — unified grid-illumination subpath. Promoted after 2-consumer threshold met. |
   ```

2. Renumber or re-label the boss row — `boss` now lands on **v0.5.0** (or whatever the next minor is) when Phase 6 starts.

3. Update the "Subsystem version drift" example block (lines 510–518) to reflect that bestiary + dungeon-walk both move to `^0.4.0` post-promotion, while `arena` etc. stay on their respective minors.

This is plan-level bookkeeping — not orchestrator-blocking. Surface it during the AGENTS.md review at session-end.

---

## Suggested AGENTS.md updates

After both phases land, the following entries are worth proposing to `/Users/tom/dev/forge/AGENTS.md`:

1. **Document the URL-vs-path decoupling pattern**. Under "Package shape", add a one-liner: *"Exports paths and source paths may differ — e.g., `./light` lives at `src/pixi/light/` because of the no-pixi-outside-src/pixi rule. The `exports` map is the source of truth for the consumer-facing URL."*

2. **Reaffirm the determinism boundary**. Under "Peer-dep policy" or a new "Module placement" section: *"Any new surface that needs `pixi.js` runtime classes (`Filter`, `BufferImageSource`, etc.) must live under `src/pixi/<name>/` even if it exports at a top-level URL alias."*

…and for `/Users/tom/dev/echo/AGENTS.md`:

3. **Codify the "two-consumer → promotion" trigger as observed**. Under "Forge promotion gates": *"Lighting was the first realised promotion under this rule (v0.4.0). The pattern: subsystem ships local; second subsystem copies byte-for-byte; both diff-clean for ≥1 cycle → promote."*

Do not write these directly. Present them to the user for approval at session end.

---

## Appendix A — Files touched (master list)

### Forge (Phase A)

**Create**:
- `/Users/tom/dev/forge/src/pixi/light/index.ts`
- `/Users/tom/dev/forge/src/pixi/light/flicker.ts`
- `/Users/tom/dev/forge/src/pixi/light/presets.ts`
- `/Users/tom/dev/forge/src/pixi/light/shaders.ts`
- `/Users/tom/dev/forge/src/pixi/light/system.ts`
- `/Users/tom/dev/forge/test/pixi/light.test.ts`

**Edit**:
- `/Users/tom/dev/forge/package.json` (version + exports)
- `/Users/tom/dev/forge/rolldown.config.ts` (new entry)
- `/Users/tom/dev/forge/CHANGELOG.md` (new section)

### Echo (Phase B)

**Edit**:
- `/Users/tom/dev/echo/subsystems/bestiary/package.json` (forge dep bump)
- `/Users/tom/dev/echo/subsystems/dungeon-walk/package.json` (forge dep bump)
- `/Users/tom/dev/echo/subsystems/bestiary/src/main.ts` (import rewrite)
- `/Users/tom/dev/echo/subsystems/bestiary/src/plugin.ts` (import rewrite)
- `/Users/tom/dev/echo/subsystems/dungeon-walk/src/main.ts` (import rewrite)
- `/Users/tom/dev/echo/subsystems/dungeon-walk/src/plugin.ts` (import rewrite)

**Delete** (recursive):
- `/Users/tom/dev/echo/subsystems/bestiary/src/systems/light/` (5 files)
- `/Users/tom/dev/echo/subsystems/dungeon-walk/src/systems/light/` (5 files)
- `/Users/tom/dev/echo/subsystems/bestiary/test/light-flicker.test.ts`
- `/Users/tom/dev/echo/subsystems/dungeon-walk/test/light-flicker.test.ts`

### Net change

- Forge: +6 files (~550 LOC).
- Echo: −12 files (~−540 LOC) + 6 file edits.

The duplication delta closes cleanly. After landing, echo's `subsystems/*/src/systems/` no longer contains a `light/` folder — lighting is fully owned by forge.
