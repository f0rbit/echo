# echo

An infinite dungeon crawler, built on [`@f0rbit/forge`](https://www.npmjs.com/package/@f0rbit/forge). The repo is a `bun` workspaces monorepo of seven small playable subsystems plus the composed final game — each subsystem stress-tests a different forge surface, then their proven patterns compose into `main`.

See [`PLAN.md`](./PLAN.md) for the full scoping document. Contributors (human or agent): start at [`AGENTS.md`](./AGENTS.md) — it routes to the task-specific playbooks in [`docs/`](./docs/).

## Live URLs (post-deploy)

- Hub: <https://f0rbit.github.io/echo/>
- Subsystems: <https://f0rbit.github.io/echo/dungeon-walk/>, <https://f0rbit.github.io/echo/bestiary/>, <https://f0rbit.github.io/echo/arena/> (+ <https://f0rbit.github.io/echo/arena/debug/>), <https://f0rbit.github.io/echo/loot/> (+ <https://f0rbit.github.io/echo/loot/debug/>), <https://f0rbit.github.io/echo/progress/> (+ <https://f0rbit.github.io/echo/progress/debug/>) — XP, levelling, perk-choice on level-up, localStorage disk save/load, `/boss/`, `/hub/`
- Composed game: <https://f0rbit.github.io/echo/main/>

## Dev quick-start

```sh
bun install              # install all workspaces
bun run hub:dev          # run the hub landing locally
bun run hub:build        # build hub static output
bun run build:all        # build hub + subsystems + main
bun test                 # run all replay-as-test fixtures
```
