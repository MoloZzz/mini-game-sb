# mini-game-sb

This is a project to try stable difusion. Just a simple card game (fantasy).

## Agent context

[`AGENTS.md`](AGENTS.md) is the compact entry point for AI-assisted work. It routes agents to small, task-specific context packs in [`docs/agent/`](docs/agent/) instead of requiring them to scan the whole repository. Agent-context commands:

```
npm run brain:impact # show packs affected by the current working-tree change
npm run brain:retrieve -- "NPC auction for duplicate cards" # retrieve product context from the vault
npm run brain:product -- "How could we improve D7 retention?" # evidence-first product decision bundle
npm run sync:brain   # regenerate the code-derived surface after structural changes
npm run check:brain
```

For implementation and review tasks, agents must end their handoff with a one-line **Brain trace**: context packs read, change impact, knowledge updated (or why none was needed), and verification result. This is an audit receipt, not internal reasoning.

## start command

```
cd game-ui && npm run dev
```
