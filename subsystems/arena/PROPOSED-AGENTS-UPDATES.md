# Proposed AGENTS.md updates — arena Phase 3.3–3.6

These are conventions that emerged while building `subsystems/arena/`. Each block is shaped to paste into `~/dev/echo/AGENTS.md` at the indicated section. Review one-by-one and either merge into AGENTS.md or discard — **nothing here has been written to AGENTS.md yet**.

Citations point to FRICTION.md (this subsystem) and the relevant commits.

---

## 1. Hitstop is a game-state gate, NOT `time.scale = 0`

**Target section:** new subsection under "Forge API gotchas" (or a new "Hitstop" subsection if the topic grows).

> ### Hitstop = game-state gate
>
> Do NOT model hitstop as `ctx.time.scale = 0`. `time.advance(real_dt, each)` increments the accumulator by `real_dt * scale`; with `scale = 0` the accumulator never fills, `sch.tick` never fires, and the `pre`-stage release system that's supposed to restore `scale = 1` never runs. Permanent freeze.
>
> Correct pattern: `hitstop_r.remaining > 0` → every gameplay system early-returns. A `pre`-stage release decrements `remaining`; that system must NOT gate on itself. `time.scale` stays at `1`. Render-stage systems keep ticking (shake + flash + light-fx continue to decay through the freeze — intentional). Replay determinism preserved because `time.tick` advances normally.
>
> See `subsystems/arena/src/systems/hitstop.ts` and FRICTION.md §1 (commit `52ba5b6`).

---

## 2. Systems reading `hit_events_r` AFTER `hitstop_trigger` must NOT gate on hitstop

**Target section:** "Forge API gotchas" or alongside the hitstop note above.

> ### Hit-event consumers and hitstop gating
>
> `hit_events_r` is cleared in the **next** tick's `pre` stage. `hitstop_trigger` (update stage, after combat) sets `hitstop_r.remaining = 4` on the **same** tick the hit landed. Any system that reads `hit_events_r` later in that same update stage and gates on hitstop will skip on the trigger tick — and by the time hitstop releases 4 ticks later, the events have been cleared. Emit-side work (particles, light-fx hit-glows, screen flash) must NOT gate on hitstop. Only `advance`/`decay`-style work gates.
>
> See `subsystems/arena/src/systems/particles.ts` and FRICTION.md §2 (commit `c984dd9`).

---

## 3. Continuous-motion subsystems skip `visual_pos_c` and the tween system

> **Merged into AGENTS.md (commit pending).**

---

## 4. Camera shake via `app.render.set_screen_offset` (forge ≥ 0.4.3)

**Target section:** "Rendering conventions".

> ### Camera shake
>
> Use `app.render.set_screen_offset(dx, dy)` (forge 0.4.3+). This writes through to `surface_sprite.position` in window coords — 1 px shake = 1 device pixel of jitter regardless of integer scale.
>
> Do NOT mutate `app.stage.position` (shakes the HUD and palette UI) or `app.render.world.position` (shifts content inside the offscreen RenderTexture at design resolution — at 6× scale, 1 design-px = 6 device-px of jitter, way too much). `app.render.world` has identity transform; the design→window scale lives on the `surface_sprite` child of `app.stage`.
>
> Shake math runs in the `render` stage AFTER `forge.render`. Magnitude push happens in `update` after combat; the apply system samples seeded jitter and decays each frame. See `subsystems/arena/src/systems/camera-shake.ts` and FRICTION.md §12.

---

## 5. Lighting filter is the right primitive for cosmetic flashes (no FOV needed)

**Target section:** "Rendering conventions".

> ### Lighting filter for cosmetic-only use
>
> `@f0rbit/forge/light`'s `make_light_system` is useful even when the subsystem has no FOV. Configure `ambient: [1, 1, 1]` (filter is visually transparent until FX lights are added) plus an eye-light covering the whole arena: `radius_cells: Math.max(g.cols, g.rows) * 2`, `intensity: 1`, `falloff: 0.01`. Screen-flash + hit-glow lights then add color on top.
>
> Reuses forge's two-shader path (WebGL + WebGPU) — no one-off Graphics overlay management. Cost ~0.2 ms/frame on integrated GPUs.
>
> See `subsystems/arena/src/main.ts` and FRICTION.md §10.

---

## 6. Debug fixture build pipeline — `debug.html` references `./main.js`, not `./main-debug.js`

> **Merged into AGENTS.md (commit pending).**

---

## 7. Bun test default 5 s timeout — replay-as-tests need explicit override

> **Merged into AGENTS.md (commit pending).**

---

## Notes for reviewer

- Items 1–2 are the biggest deliverables — they document a non-obvious failure mode that bit arena hard during Phase 3.4/3.5. Strongest case for inclusion.
- Items 3–5 are conventions the next gameplay subsystem (`loot`, `progress`) will hit unless documented.
- Item 6 is a scaffold gotcha; could be a 1-line aside.
- Item 7 is a generic bun-test note; arguably belongs in the root-level "Build / test / deploy" rather than echo-specific AGENTS.md.
