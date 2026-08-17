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

## Datos sensibles

Este repo es **público**. Nunca commitees datos reales de infra ni de personas —
usá placeholders:

| En vez de | Usá |
| --- | --- |
| El dominio de prod | `<PROD_DOMAIN>` |
| La IP de la VM | `<VM_IP>` |
| El path de deploy en la VM | `<DEPLOY_DIR>` (en workflows: `secrets.GCP_DEPLOY_DIR`) |
| El project ID de GCP | `secrets.GCP_PROJECT_ID` |
| Email de una persona real | `usuario@example.com` |
| Nombre / dirección real | Datos ficticios (`Ana Pérez`, `Calle Falsa 123`) |

Reglas de fondo:

- **Valores de infra van como GitHub secret**, no en el YAML: GitHub los enmascara
  como `***` en los logs, que también son públicos.
- **Tests y fixtures usan datos inventados.** Nunca copies un mail real del
  proveedor ni datos de la persona cuidada, ni siquiera "solo para probar".
- **Las reglas del clasificador viven en `secrets/`** (gitignoreado) y en
  Infisical. Ese directorio no se trackea.
- `.gitleaks.toml` chequea esto en cada PR. Si te frena con un falso positivo,
  agregá el patrón a la allowlist de la regla — no borres la regla ni pongas el
  valor real en el archivo de config.

## Resources

- [Mastra Documentation](https://mastra.ai/llms.txt)
- [Skills Discovery](https://mastra.ai/.well-known/skills/index.json)
