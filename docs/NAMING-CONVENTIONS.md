# Naming Conventions

Un archivo por entidad (agent, tool, step, schema, type, workflow). Excepción: `<dominio>.utils.ts` agrupa helpers cohesivos del dominio.

## Estructura

```
src/mastra/
├── agents/       <dominio>-agent.ts | mostro-supervisor.ts
├── tools/        <dominio>-<accion>-tool.ts
├── scorers/      <dominio>-scorer.ts
├── routes/       webhook-<dominio>.route.ts
├── lib/          <dominio>-<propósito>.ts (run, subscribers), helpers compartidos
├── config/       <propósito>.config.ts
├── workflows/<dominio>/
│   ├── <dominio>.workflow.ts
│   ├── schemas/  <algo>.schema.ts
│   ├── steps/    <algo>.step.ts
│   ├── types/    <algo>.type.ts
│   └── utils/    <dominio>.utils.ts
└── index.ts      registro central (todo agent/workflow/scorer se declara acá)
```

## Archivo → export → id

Archivo en kebab-case + sufijo de tipo. Export en camelCase (PascalCase para types). El `id` interno de Mastra (`createTool`/`createStep`/`createWorkflow`/`new Agent`) es kebab-case y más corto, sin sufijo redundante.

| Tipo     | Archivo                          | Export                 | id                       |
| -------- | -------------------------------- | ---------------------- | ------------------------ |
| Agent    | `meds-agent.ts`                  | `medsAgent`            | `meds-agent`             |
| Tool     | `meds-request-tool.ts`           | `requestMedsTool`      | `request-meds`           |
| Step     | `wait-meds-confirmation.step.ts` | `waitMedsConfirmation` | `wait-meds-confirmation` |
| Schema   | `meds-state.schema.ts`           | `medsStateSchema`      | —                        |
| Type     | `meds-state.type.ts`             | `MedsState`            | —                        |
| Workflow | `meds.workflow.ts`               | `medsWorkflow`         | `meds-workflow`          |
| Scorer   | `weather-scorer.ts`              | `translationScorer`    | —                        |
| Route    | `webhook-meds.route.ts`          | `webhookMedsAckRoute`  | —                        |
| Config   | `app.config.ts`                  | `appConfig`            | —                        |

Nota: en tools el orden se invierte respecto al archivo — el archivo antepone el dominio (`meds-request-tool`), el export antepone la acción (`requestMedsTool`).

## Otras reglas

- Supervisor es la excepción de nombre: `mostroSupervisor`, sin sufijo `Agent`.
- Sub-agentes: al registrar uno nuevo en `mostroSupervisorAgents`, agregar su key a `lib/sub-agent-keys.ts` (el `satisfies` del supervisor lo exige en compilación; `users.ts` usa esa lista para des-derivar resourceIds).
- Types se infieren con `z.infer<typeof xSchema>`, sin sufijo `Type` en el nombre exportado.
- Comillas simples y sin `;` en código nuevo (`meds/`, `diapers/`); `weather/` e `index.ts` son legacy con comillas dobles y `;` — mantené el estilo del archivo que edites.
- Comentarios solo para explicar un "por qué" no obvio (ver `meds-subscribers.ts`), nunca para describir "qué hace" el código.
