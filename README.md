# mini-game-sb

This is a project to try stable difusion. Just a simple card game (fantasy).

## Agent context

[`AGENTS.md`](AGENTS.md) is the compact entry point for AI-assisted work. It routes agents to small, task-specific context packs in [`docs/agent/`](docs/agent/) instead of requiring them to scan the whole repository. Agent-context commands:

```
npm run brain:impact # show packs affected by the current working-tree change
npm run sync:brain   # regenerate the code-derived surface after structural changes
npm run check:brain
```

## start command

```
cd game-ui && npm run dev
```
