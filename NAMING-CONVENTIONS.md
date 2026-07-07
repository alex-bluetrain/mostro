# Naming Conventions

Convenciones extraídas de la estructura actual de `src/mastra/`. El proyecto sigue un patrón de **feature-folder por dominio** (`diapers`, `meds`, `weather`) con archivos organizados por tipo dentro de cada workflow, y **un archivo por cosa**: cada agent, tool, step, schema, type o util vive en su propio archivo — nunca se agrupan varias entidades del mismo tipo en un solo archivo (excepto los scorers de un mismo dominio, ver excepción abajo).

## 1. Regla general: un archivo por entidad

- Un agent = un archivo.
- Un tool = un archivo.
- Un step = un archivo.
- Un schema = un archivo.
- Un type = un archivo.
- Una workflow = un archivo.
- Los `utils` de un dominio SÍ pueden agrupar varias funciones relacionadas en `<dominio>.utils.ts` (ver `meds.utils.ts`, `weather.utils.ts`), ya que son helpers pequeños y cohesivos del mismo dominio.
- Excepción: `weather-scorer.ts` agrupa varios scorers relacionados del mismo dominio (`toolCallAppropriatenessScorer`, `completenessScorer`, `translationScorer`) — aceptable cuando son pequeños y pertenecen al mismo dominio/feature.

## 2. Estructura de carpetas

```
src/mastra/
├── agents/                 <dominio>-agent.ts | mostro-supervisor.ts
├── tools/                  <dominio>-<accion>-tool.ts
├── scorers/                <dominio>-scorer.ts
├── routes/                 webhook-<dominio>.route.ts
├── lib/                    <dominio>-run.ts, <dominio>-subscribers.ts, helpers compartidos (date-scope.ts)
├── config/                 app.config.ts
├── workflows/
│   └── <dominio>/
│       ├── <dominio>.workflow.ts
│       ├── schemas/        <algo>.schema.ts
│       ├── steps/          <algo>.step.ts
│       ├── types/          <algo>.type.ts
│       └── utils/          <dominio>.utils.ts
├── index.ts                registro central (Mastra instance)
└── ngrok.ts
```

Cada dominio de workflow (`diapers/`, `meds/`, `weather/`) replica la misma subestructura: `schemas/`, `steps/`, `types/`, `utils/` (no todos los dominios necesitan las 4 — `weather` no tiene `types/` propio en algunos casos si no aplica, pero cuando existe contenido de ese tipo, va en su carpeta correspondiente).

## 3. Nombres de archivo (kebab-case + sufijo por tipo)

Todos los nombres de archivo van en **kebab-case** y llevan un sufijo que identifica el tipo de entidad:

| Tipo | Patrón de archivo | Ejemplo |
|---|---|---|
| Agent | `<dominio>-agent.ts` | `meds-agent.ts`, `diapers-agent.ts` |
| Agent supervisor | `<nombre>-supervisor.ts` | `mostro-supervisor.ts` |
| Tool | `<dominio>-<accion>-tool.ts` | `meds-request-tool.ts`, `diapers-get-status-tool.ts` |
| Scorer | `<dominio>-scorer.ts` | `weather-scorer.ts` |
| Route | `webhook-<dominio>.route.ts` | `webhook-meds.route.ts` |
| Workflow | `<dominio>.workflow.ts` | `meds.workflow.ts`, `weather.workflow.ts` |
| Step | `<accion>.step.ts` | `wait-meds-confirmation.step.ts`, `fetch-weather.step.ts` |
| Schema | `<algo>.schema.ts` | `meds-state.schema.ts`, `wait-meds-confirmation-resume.schema.ts` |
| Type | `<algo>.type.ts` | `meds-state.type.ts`, `forecast.type.ts` |
| Utils de dominio | `<dominio>.utils.ts` | `meds.utils.ts`, `diapers.utils.ts` |
| Lib compartida | `<dominio>-<propósito>.ts` | `meds-run.ts`, `meds-subscribers.ts` |
| Config | `<propósito>.config.ts` | `app.config.ts` |

Reglas del sufijo:
- El sufijo (`.step.ts`, `.schema.ts`, `.type.ts`, `.workflow.ts`, `.route.ts`, `.config.ts`, `.utils.ts`) indica el **tipo de entidad Mastra/arquitectónica**, no el dominio.
- El prefijo (parte antes del sufijo) indica el **dominio o la acción específica** dentro de ese dominio.
- Tools y agents no usan sufijo `.tool.ts`/`.agent.ts` con punto — usan guión: `-tool.ts`, `-agent.ts` (inconsistente con el resto pero es el patrón vigente, respetarlo).

## 4. Nombres de export (camelCase)

El identificador exportado es siempre **camelCase** y corresponde 1:1 al archivo, pero el orden de las palabras puede diferir del nombre de archivo cuando el archivo antepone el dominio y el export antepone la acción:

| Archivo | Export |
|---|---|
| `meds-get-status-tool.ts` | `getMedsStatusTool` |
| `meds-request-tool.ts` | `requestMedsTool` |
| `meds-subscribe-tool.ts` | `subscribeMedsTool` |
| `diapers-get-status-tool.ts` | `getDiapersStatusTool` |
| `meds-agent.ts` | `medsAgent` |
| `meds.workflow.ts` | `medsWorkflow` |
| `wait-meds-confirmation.step.ts` | `waitMedsConfirmationStep` |
| `meds-state.schema.ts` | `medsStateSchema` |
| `meds-state.type.ts` | `MedsState` (PascalCase — ver regla de tipos) |
| `weather-scorer.ts` | `toolCallAppropriatenessScorer`, `completenessScorer`, `translationScorer` |

Patrón por tipo de export:
- **Tool**: `<verbo><Dominio>Tool` — ej. `requestMedsTool`, `getMedsStatusTool`, `subscribeMedsTool`.
- **Agent**: `<dominio>Agent` — ej. `medsAgent`, `weatherAgent`. El supervisor es la excepción: `mostroSupervisor` (sin sufijo `Agent`).
- **Workflow**: `<dominio>Workflow` — ej. `medsWorkflow`, `weatherWorkflow`.
- **Step**: `<accion>Step` (camelCase de todo el nombre de archivo) — ej. `waitMedsConfirmationStep`, `fetchWeatherStep`.
- **Schema**: `<nombre>Schema` — ej. `medsStateSchema`, `fetchWeatherInputSchema`.
- **Type**: PascalCase, sin sufijo redundante si el nombre ya es descriptivo — ej. `MedsState`, `Forecast`. Se infiere con `z.infer<typeof xSchema>`.
- **Scorer**: `<algo>Scorer` — ej. `translationScorer`, `completenessScorer`.
- **Route**: `webhook<Dominio><Acción>Route` — ej. `webhookMedsAckRoute`, `webhookDiapersRoute`.
- **Config**: `<propósito>Config` — ej. `appConfig`.
- **Funciones de lib**: verbo + dominio en camelCase — ej. `startMedsOrder`, `acknowledgeMedsOrder`, `getMedsRunId`, `getCurrentYearMonth`.

## 5. IDs de entidades Mastra (kebab-case, distinto del nombre de archivo/export)

Los `id` que se le pasan a `createTool`, `createStep`, `createWorkflow`, `new Agent` son **kebab-case** y suelen ser más cortos que el nombre de archivo (sin repetir el dominio si ya es obvio por contexto, o sin el prefijo redundante):

- Tool: `id: 'request-meds'` (archivo `meds-request-tool.ts`, export `requestMedsTool`).
- Agent: `id: 'meds-agent'`.
- Workflow: `id: 'meds-workflow'`.
- Step: `id: 'wait-meds-confirmation'` (sin el sufijo `-step`).

## 6. Registro central

Todo agent, tool (indirectamente vía agent), workflow y scorer debe registrarse en `src/mastra/index.ts` (regla ya establecida en `AGENTS.md`). El nombre de la variable importada en `index.ts` coincide exactamente con el export original — no se renombra en el import.

## 7. Otras convenciones observadas

- Comillas simples en la mayoría de archivos nuevos; algunos archivos legacy (`weather-scorer.ts`, `app.config.ts`, `weather-tool.ts`) usan comillas dobles — no hay enforcement estricto, pero preferir comillas simples y sin `;` final para código nuevo (ver estilo de `meds-*` y `diapers-*`).
- Sin punto y coma al final de las declaraciones en los archivos más nuevos (`meds/`, `diapers/`), con punto y coma en los más antiguos (`weather/`, `index.ts`). Mantener consistencia dentro del archivo que se edite.
- Comentarios solo cuando explican un "por qué" no obvio (ver `meds-subscribers.ts` sobre `process.cwd()` y bundling) — no comentarios descriptivos de "qué hace" el código.
