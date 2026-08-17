# Templates de reglas de clasificación

Equivalente a `.env.example` pero para el JSON de reglas que se seedea en Mongo
(formato completo en [../clasificador.md](../clasificador.md), arquitectura en
[../inbox-pipeline.md](../inbox-pipeline.md)).

## Uso

1. Copiar el template del dominio a un path **fuera del repo** (el JSON completo contiene
   datos sensibles del proveedor y no se commitea):

   ```bash
   cp docs/classifier-rules/diapers.example.json C:/mostro-secrets/diapers-rules.json
   ```

2. Completar los placeholders `<...>`:
   - `condition`: descripción en lenguaje natural para que el LLM decida si el mail matchea.
   - `examples.match` / `examples.no_match`: fragmentos de mails reales del proveedor (few-shot).
     Se pueden agregar tantos como haga falta.

3. Seedear:

   ```bash
   pnpm seed:classifier -- --domain diapers --file C:/mostro-secrets/diapers-rules.json --author "Alex" --changelog "seed inicial"
   ```

   Cada seed crea una versión nueva (inmutable) y mueve el puntero activo. El próximo ciclo
   de cron ya usa las reglas nuevas, sin redeploy.

## Bootstrap automático desde env (prod)

Las reglas son una precondición del poll: sin ellas no hay nada que clasificar. Para que una base
nueva no arranque en ese estado, al boot corre `ensureClassifierSeed()`
(`src/mastra/lib/classifier-seed.ts`), en el mismo lugar del ciclo de vida que el seed del admin,
con semántica **seed-if-missing** por dominio:

| Estado del dominio | Qué hace el boot |
| --- | --- |
| Ya tiene puntero activo | Nada. Nunca pisa lo que hay en Mongo. |
| Sin puntero + `CLASSIFIER_RULES_<DOMAIN>` válida | Publica el snapshot v1 (`author: boot-seed`). |
| Sin puntero + env ausente o vacía | `console.error` avisando que ese dominio queda sin procesar. |
| Sin puntero + JSON inválido | `console.error` con el detalle. No tumba el proceso. |

Si el dominio igual queda sin reglas, el poll **saltea** cada corrida con un warning en vez de
fallar: no toca la casilla y los mails quedan intactos para cuando se carguen las reglas. Un
dominio sin configurar no rompe a los otros dos.

El "nunca pisa" es deliberado: cuando exista el front de administración, la DB es el dueño de las
reglas y sus ediciones no pueden ser revertidas por un redeploy. El env var es solo el arranque en
frío.

Las variables (`CLASSIFIER_RULES_DIAPERS`, `CLASSIFIER_RULES_MEDS`, `CLASSIFIER_RULES_REFUNDS`) se
cargan en Infisical con el JSON **minificado**:

```bash
node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('C:/mostro-secrets/diapers-rules.json','utf8'))))"
```

Para publicar versiones nuevas de reglas ya seedeadas, el camino sigue siendo `pnpm seed:classifier`
(o el front, cuando exista): cambiar el env var de un dominio que ya tiene puntero no tiene efecto.

## Reglas del template — qué NO tocar

- **`label`**: deben coincidir con los registrados en
  `src/mastra/workflows/<domain>-poll/<domain>-outcome-handlers.ts`. Un label clasificado sin
  handler queda `outcome.completed` sin ejecutar nada.
- **`extract`**: los campos `required` de cada template son exactamente los que el handler
  parsea con su Zod resume schema (`workflows/*/schemas/wait-*-resume.schema.ts`). Se pueden
  **agregar** campos extra (Zod los ignora), pero quitar o renombrar los requeridos rompe el
  resume (`outcome.failed`).
- **`default-outcome`**: el label es libre (no tiene handler); el mail que caiga ahí se marca
  `outcome.review` para revisión manual.
