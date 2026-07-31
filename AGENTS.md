# AGENTS.md

## CRITICAL: Load `mastra` skill first

Load the `mastra` skill BEFORE any Mastra work. Never rely on cached knowledge — APIs change between versions.

## Design Principle: KISS

Always prioritize the KISS principle (Keep It Simple, Stupid):

- Prefer direct, explicit code over abstractions. Don't introduce factories, wrappers, or indirection layers unless there's a concrete, current need (not a hypothetical future one).
- The consumer creates what it needs, where it needs it. Avoid IoC-style delegation when a plain instantiation works.
- Fewer layers > more layers. If removing an abstraction makes the code easier to follow without breaking anything, remove it.
- Three similar lines of code are better than a helper used once.

## Rules

- Register all agents, tools, workflows, and scorers in `src/mastra/index.ts`
- Use the `dev` and `build` scripts from `package.json` instead of running `mastra dev` / `mastra build` directly

## Resources

- [Mastra Documentation](https://mastra.ai/llms.txt)
- [Skills Discovery](https://mastra.ai/.well-known/skills/index.json)
