# Naming Conventions

> [!IMPORTANT]
>
> consolidate and clean up this messy doc

Un archivo por entidad (agent, tool, step, schema, type, workflow). Excepción: `<dominio>.utils.ts` agrupa helpers cohesivos del dominio.

## Estructura

```
src/mastra/
├── agents/       <dominio>-agent.ts | mostro-supervisor.ts
├── tools/        <dominio>-<accion>-tool.ts
├── scorers/      <dominio>-scorer.ts
├── lib/          <dominio>-<propósito>.ts (run, subscribers), helpers compartidos
│   └── inbox/    módulo compartido de polling de casilla (gmail-reader, gmail-message,
│                 mail-extractor, poll-mailbox, poll-step, notify-mail-failure,
│                 retry-failed-mails):
│                 sin prefijo de dominio, porque lo consumen los tres <dominio>-poll.workflow.ts
├── config/       <propósito>.config.ts
├── workflows/
│   ├── <workflow-name>/             un directorio por workflow, no por dominio
│   │   ├── <workflow-name>.workflow.ts
│   │   ├── schemas/  <algo>.schema.ts
│   │   ├── steps/    <algo>.step.ts
│   │   ├── types/    <algo>.type.ts
│   │   └── utils/    <dominio>.utils.ts
│   └── <dominio>-poll/              workflow de polling del mismo dominio, directorio propio
│       ├── <dominio>-poll.workflow.ts   solo arma el schedule (cron) y encadena el step
│       └── steps/
│           └── poll-<dominio>-mailbox.step.ts   createPollStep(id, config): el mapa
│                                        step -> { schema, description, resume } vive acá,
│                                        no inline en el workflow; importa los resume
│                                        schemas y getXRunId desde ../../<dominio>/schemas|utils
│                                        en vez de duplicarlos, porque son del workflow principal
└── index.ts      registro central (todo agent/workflow/scorer se declara acá)
```

## Archivo → export → id

Archivo en kebab-case + sufijo de tipo. Export en camelCase (PascalCase para types). El `id` interno de Mastra (`createTool`/`createStep`/`createWorkflow`/`new Agent`) es kebab-case y más corto, sin sufijo redundante.

| Tipo            | Archivo                          | Export                    | id                       |
| --------------- | -------------------------------- | ------------------------- | ------------------------ |
| Agent           | `meds-agent.ts`                  | `medsAgent`               | `meds-agent`             |
| Tool            | `meds-request-tool.ts`           | `requestMedsTool`         | `request-meds`           |
| Step            | `wait-meds-confirmation.step.ts` | `waitMedsConfirmation`    | `wait-meds-confirmation` |
| Schema          | `meds-state.schema.ts`           | `medsStateSchema`         | —                        |
| Type            | `meds-state.type.ts`             | `MedsState`               | —                        |
| Workflow        | `meds.workflow.ts`               | `medsWorkflow`            | `meds-workflow`          |
| Scorer          | `weather-scorer.ts`              | `translationScorer`       | —                        |
| Workflow (poll) | `meds-poll.workflow.ts`          | `medsPollWorkflow`        | `meds-poll`              |
| Tool (retry)    | `meds-retry-failed-mail-tool.ts` | `retryMedsFailedMailTool` | `retry-meds-failed-mail` |
| Config          | `app.config.ts`                  | `appConfig`               | —                        |

Nota: en tools el orden se invierte respecto al archivo — el archivo antepone el dominio (`meds-request-tool`), el export antepone la acción (`requestMedsTool`).

## Otras reglas

- Supervisor es la excepción de nombre: `mostroSupervisor`, sin sufijo `Agent`.
- Sub-agentes: al registrar uno nuevo en `mostroSupervisorAgents`, agregar su key a `lib/sub-agent-keys.ts` (el `satisfies` del supervisor lo exige en compilación; `users.ts` usa esa lista para des-derivar resourceIds).
- Types se infieren con `z.infer<typeof xSchema>`, sin sufijo `Type` en el nombre exportado.
- Cada workflow vive en su propio directorio bajo `workflows/` (`workflows/<workflow-name>/`), no agrupado por dominio. El poll workflow de un dominio es un workflow más y tiene su propio directorio (`workflows/<dominio>-poll/`) separado del workflow principal (`workflows/<dominio>/`); no duplica sus resume schemas ni sus utils (p. ej. `getXRunId`) — los importa directamente desde `../<dominio>/schemas/...` y `../<dominio>/utils/...`, porque son del workflow principal.
- El step del poll (`createPollStep(id, config)`) vive en su propio archivo bajo `steps/`, igual que cualquier otro step — nunca inline dentro de `<dominio>-poll.workflow.ts`. El archivo del workflow solo arma el `schedule` y encadena el step importado.
- Comillas simples y sin `;` en código nuevo (`meds/`, `diapers/`); `weather/` e `index.ts` son legacy con comillas dobles y `;` — mantené el estilo del archivo que edites.
- Comentarios solo para explicar un "por qué" no obvio (ver `meds-subscribers.ts`), nunca para describir "qué hace" el código.

# Context

## Philosophy

Names are intentionally verbose and self-descriptive.

This project favors **discoverability** over brevity. A developer should be able to identify the purpose and relationship of a file using only its filename, without opening it or relying on its directory.

Although this introduces some redundancy, it provides:

- Effective fuzzy file searches (VS Code `CTRL+P`, Neovim `:Telescope find_files`)
- Reduced context switching (no need to open files to identify them)
- More meaningful Git history and commit diffs
- Better context for AI-assisted development by making file purpose and relationships inferable from naming conventions alone
- Better navigation in large repositories

## Workflow Organization

Each workflow owns all of its artifacts.

```text
workflows/
  diapers/
    workflow.ts

    steps/
      wait-diapers-confirmation.step.ts
      request-diapers.step.ts

    schemas/
      wait-diapers-confirmation-resume.schema.ts
      wait-diapers-confirmation-input.schema.ts
      wait-diapers-confirmation-output.schema.ts
```

Every step lives in its own file.

Every reusable schema lives in its own file.

## File Naming

File names should include enough context to be meaningful when viewed outside their directory.

Prefer:

```text
wait-diapers-confirmation.step.ts
wait-diapers-confirmation-resume.schema.ts
wait-diapers-confirmation-input.schema.ts
```

Avoid:

```text
resume.schema.ts
input.schema.ts
confirmation.schema.ts
```

The goal is that searching for:

```text
wait-diapers
```

immediately reveals every artifact related to that step.

## Export Naming

Export names should mirror the filename whenever practical.

```ts
export const waitDiapersConfirmation = createStep(...)

export const waitDiapersConfirmationResumeSchema = z.object(...)
```

This keeps imports explicit and easy to understand.

```ts
import { waitDiapersConfirmation } from "./steps/wait-diapers-confirmation.step";
import { waitDiapersConfirmationResumeSchema } from "./schemas/wait-diapers-confirmation-resume.schema";
```

## Redundancy is Acceptable

This convention intentionally allows repeated words such as:

- `diapers`
- `confirmation`
- `resume`

Although the directory already provides context, repeating that context in filenames improves global search and reduces ambiguity.

The project prioritizes:

- Explicitness
- Discoverability
- Consistency

over minimizing filename length.

## General Rule

When deciding between a shorter name and a more descriptive one, prefer the name that is easier to find and understand from a filename or import statement alone.
