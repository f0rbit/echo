@~/.claude/AGENTS.md

# echo — agent notes

`echo` is an infinite dungeon crawler built on `@f0rbit/forge`. The repo is a bun-workspaces monorepo of seven small playable subsystems (`subsystems/<name>/`) plus a composed final game (`main/`) and a static landing site (`hub/`). See [`PLAN.md`](./PLAN.md) for the full scoping document.

## Repo layout

```
echo/
├── hub/                   # Astro static landing — deployed at /echo/
├── subsystems/<name>/     # bun-bundled mini-games — deployed at /echo/<name>/
├── main/                  # composed game — deployed at /echo/main/ (Phase 8)
└── .github/workflows/pages.yml
```

## URL convention (flat)

- Hub: `https://f0rbit.github.io/echo/`
- Subsystems: `https://f0rbit.github.io/echo/<name>/` — flat, no `subsystems/` segment in the URL
- Source layout still uses `subsystems/<name>/` for organisation; the deploy step aggregates `subsystems/<name>/dist/` to `_site/<name>/`

## Static-only — no SSR

GitHub Pages can't run server functions. Astro is configured `output: "static"`. Subsystems use `bun build --target browser` and ship a static `index.html` + `dist/main.js`.

## Per-subsystem pattern

Mirror `~/dev/coin-collector/` exactly: `bun build src/main.ts --outdir dist --target browser`, dependencies on `@f0rbit/forge` from npm (never via workspace symlink), `pixi.js`, `@f0rbit/corpus`, `zod`. Each subsystem owns its own `index.html`, `tsconfig.json`, `replays/`, and `test/`. See `PLAN.md` §3 for canonical shape.

## No `@echo/shared`

Subsystems never import from each other or from a shared sibling package. Duplication is the signal that something belongs in forge — not in a sidecar package. See `PLAN.md` §5 for the forge promotion criteria (2+ subsystems duplicating a helper → propose forge promotion).

## `main` not yet a workspace

`main/` is not in `workspaces` until Phase 8 — bun rejects an empty workspace directory at install time. When Phase 8 starts and `main/package.json` exists, add `"main"` back to the root `workspaces` array. The `main:build` and Pages-deploy steps already detect `main/package.json` and skip gracefully when absent.

## Build / test / deploy

- `bun run hub:dev` — run the hub landing locally (`localhost:4321/echo/`)
- `bun run build:all` — build hub + every subsystem + main (no-ops gracefully when subsystems/main are empty)
- `bun test` — runs every subsystem's replay-as-test fixture from the root
- Push to `main` triggers `.github/workflows/pages.yml` which builds, aggregates to `_site/` (flat), and deploys to GitHub Pages

## Forge promotion gates

Subsystems may sit on different `@f0rbit/forge` minors during development; Phase 8 aligns everything to the latest forge minor and re-records any drifted replay fixtures. See `PLAN.md` §5 for the per-phase forge bump table.

## Rendering conventions

Three patterns that have repeatedly tripped up consumers — bake them in once:

### Canvas → world coords

Use `event_to_world(e, canvas, app.camera)` from `@f0rbit/forge/pixi` for DOM pointer events. It handles `getBoundingClientRect` + CSS-pixel-to-canvas-buffer DPR scaling + forge's two-stage RenderTexture pipeline. **Never reimplement `fit_scale` math** — forge's `Container.worldTransform` reports identity for `app.render.world` because the actual scale lives on the offscreen-composited `surface_sprite` on `app.stage`, which is invisible to `toLocal`.

### Cell coordinates are CENTER, not top-left

`g.cell_to_world(cx, cy)` returns `{ cx*tile + tile/2, cy*tile + tile/2 }`. So `pos_c` for any cell-aligned entity (floors, walls, mobs) is already the cell center. Sprites with `anchor: { x: 0.5, y: 0.5 }` render correctly with NO additional offset. **Don't add `+ g.tile / 2` to coords retrieved from `pos_c`** — that bug bit `wall-debug.ts` and `debug-overlay.ts` independently; both fixed.

### Unfiltered overlay container

`app.render.debug_overlay` (Container) sits OUTSIDE the lighting filter — children render at full brightness regardless of the player's eye-light reach. Use it for HUD, debug markers, FOV circles, click visualizations. Children of `app.render.world` get the lighting treatment (which darkens them in unseen areas).
