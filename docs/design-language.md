# Design language — the contract

> Every echo game follows this page. It is a contract, not a tutorial — recipes and war stories live in the other `docs/*.md` files. New colors, fonts, or moods require an edit here first, never an inline value.

## Palette tokens

These are THE tokens. A hex not in this table is a contract violation.

| Token | Hex | Meaning / usage |
|-------|-----|-----------------|
| Gold | `#ffd24a` | Primary / interactive: accents, pickups, selection, titles |
| Red | `#ff4a4a`, `#f7768e` | Damage, death, failure, lost-screen |
| Green | `#9ece6a` | Go / positive prompt: heal, confirm, "press Enter to start" |
| Blue | `#7aa2f7` | XP, info |
| Background | `#0a0a10` | Page background in every `index.html` |
| HUD text | `#ffffff` primary, `#c0c0c8` secondary | All HUD labels / values |

## Font rules

| Text | Font | Recipe |
|------|------|--------|
| ALL player-facing game text (HUD, menus, modals, banners) | Press Start 2P | Pixel recipe — `resolution: 1`, NO `scale.set`, integer `fontSize` (8/16/24). Table in `docs/rendering.md` §Text recipes |
| Forge debug HUD / debug overlays only | system monospace | Crisp recipe (`resolution: 4`) per `docs/rendering.md` |

Every entry point: `await document.fonts.load("8px 'Press Start 2P'")` before `boot()`. Every HTML shell: Google Fonts `<link>` triplet. Details: `docs/rendering.md`.

## Lighting moods

| Mood | Preset | Applies to |
|------|--------|------------|
| Cold | `moon_cavern` | Combat subsystems (arena, bestiary, progress, boss) |
| Warm | `warm_torch` | Exploration subsystems (dungeon-walk, loot, hub) |

Contract only — implementation via forge `presets`. Numeric visibility baseline (eye-light `radius_cells` / `falloff` / `intensity` keeping the playfield readable, vignette at edges only): **TBD — filled by task 5.2's findings.**

## Shell screens

Every game ships the resource FSM `game_state_r: menu | playing | won | lost` (arena's `fsm.ts` copy convention — `docs/architecture.md`).

| State | Required | Content |
|-------|----------|---------|
| `menu` | always | Game title, 1–3 control lines, "Enter/Space to start" |
| `playing` | always | Gameplay |
| `won` / `lost` | only where win/loss genuinely exists — never fabricated | Outcome line + one run stat + restart hint |

Rules: update-stage gameplay systems early-return unless `playing`; render systems never gate; the FSM owns setup (never called at boot).

## HUD placement

| Corner | Content |
|--------|---------|
| Top-left | Vitals: HP, XP |
| Top-right | Goal / timer / counters |
| Bottom-left | Reserved — forge debug stats (dev-only) |
| Bottom-right | Reserved |

Minimum content: HP wherever damage exists, timer wherever timed, goal counter wherever counted. All HUD text uses the pixel font.

## Minimum juice bar

| Event | Minimum feedback |
|-------|------------------|
| Kill / hit | Screen-flash + particle burst |
| Pickup | Flash / pop |

Decorative rng is tick-seeded, never `ctx.rng`. Juice entities stay out of world-hash projections — no replay re-record (`docs/persistence-replay.md`).

## Debug surface

Debug UI is never visible in production builds. Prod = off by default; `?debug=1` = explicit opt-in; localhost = auto-on; debug fixtures hard-code `debug: true`. (Forge v0.6.0 behaviour — lands with the forge 0.6 bump in phase 3; until then `is_dev()` v0.5.x applies.)
