# Backlog

Open items rolled up from the historical plan set (`forge-renderer-testability`, `forge-lighting-promotion`, `lighting-v2`, `lighting-v3`, `walls-as-entities` — all otherwise delivered). Each item below stands alone; nothing here is blocking.

---

## B1 — Headless Pixi test helper (forge, size: XS)

Extract the `DOMAdapter` + fake-canvas + lost-WebGL-context setup from `forge/test/pixi/light.test.ts:13-43` into a shared helper so other forge tests (and consumers) can boot Pixi under `bun test` without copy-paste.

```ts
// forge/test/helpers/headless-pixi.ts
import { DOMAdapter } from "pixi.js";
export const install_headless_pixi = (): void => {
  // (body of light.test.ts:13-43, idempotent)
};
```

- Update `forge/test/pixi/light.test.ts` to call the helper.
- Add at least one other test that exercises the helper (e.g. a Sprite assembly or a render-to-RenderTexture smoke test) to validate it works outside the light module.
- Verify: `bun test` green in forge.

## B2 — Visual regression harness (forge, size: M, optional)

Playwright + pixelmatch. Out-of-band from `bun test` — runs as `bun run test:visual`. Boot forge into headless Chromium via a tiny HTML harness, screenshot `app.canvas()`, diff against goldens.

Initial fixtures:
- Autotile 4×4 grid (Godot 3x3 minimal) — one golden per corner-state class.
- Lighting preset cookbook (one frame per preset: `moon_cavern`, `warm_torch`, `frostbite`, `lab`, `sunset`, `hellscape`).

Marked **optional** in the original plan; pick up only if a render-side regression actually slips past `bun test` first.

## B3 — Commit / clean the plan dir

`.plans/forge-renderer-testability.md` was tracking shipped work but never got committed. Either:
- Commit it as the historical record alongside the deletion of the other shipped plans, or
- Delete it too if this `backlog.md` supersedes the historical narrative.

Recommend: delete — this backlog is the index now; commit history holds the per-phase detail.

---

## Closed (for reference)

| Plan | Delivered by |
|------|--------------|
| `lighting-v2.md` | superseded by v3; v2 itself shipped (`719d1ce`, `b9c65b1`) |
| `lighting-v3.md` | `1bae4e9` (bestiary), `604f76f` (dungeon-walk), `f74b8ec` (float-texture fix) |
| `forge-lighting-promotion.md` | forge `82ecdc3`, echo `0afbeb5` — both subsystems on `@f0rbit/forge/light` v0.4.0 |
| `walls-as-entities.md` | shipped with deviation: Godot 3x3 minimal autotile instead of 4-bit bitmask (`ad777c5`, `98bacba`, `09603d8`, `f93daca`) |
| `forge-renderer-testability.md` | B1/B3/B4/B5 shipped (forge `9d3918f`, echo `007a6b0` + `f93daca`); B2/B6 carried forward above |
