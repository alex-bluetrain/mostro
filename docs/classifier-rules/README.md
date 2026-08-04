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
