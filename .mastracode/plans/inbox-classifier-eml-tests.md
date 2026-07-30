# Tests de InboxClassifier con fixtures `.eml` reales

## Overview

Hoy `src/mastra/lib/inbox-classifier/inbox-classifier.test.ts:1` testea el classifier con payloads de Gmail construidos a mano (`encode('Confirmamos la entrega.')`). Eso valida la mecánica pero no valida el parseo real de MIME (multipart, HTML, quoted replies) ni la calidad de clasificación del agente. Este plan agrega:

1. **Fixtures `.eml` reales** en `tests/fixtures/mails/`.
2. Un **helper** que convierte `.eml` → payload de Gmail (`tests/fixtures/mails/eml-to-gmail-payload.ts`), usando `mailparser`.
3. Un **suite rápido** (`tests/inbox-classifier.fixtures.test.ts`) que usa los fixtures con Gmail y agente mockeados — valida `stripMailBody` contra MIME real y la mecánica de etiquetado.
4. Un **suite de integración** (`tests/inbox-classifier.integration.test.ts`) que corre el `inboxClassifierAgent` real contra los mismos fixtures, y se auto-skipea si no hay `OPENROUTER_API_KEY` real.

## Complexity Estimate

- **Size**: Medium (2 archivos de test + 1 helper + 5 fixtures + `package.json`)
- **Risk**: Low — todo aditivo. No se toca `src/`.
- **Dependencies**: `mailparser` + `@types/mailparser` como devDependencies. El suite de integración consume tokens de OpenRouter (deepseek-v4-flash, ~5 llamadas).

## Corrección importante respecto de lo discutido antes

El suite de integración **no debe importar `src/mastra/index.ts`**. Ese módulo tiene side effects de top-level: `mongoose.connect` (línea 33), `startNgrokTunnel` (37) y `ensureAdminSeed` (41). En su lugar el test construye una instancia mínima:

```ts
const mastra = new Mastra({ agents: { inboxClassifier: inboxClassifierAgent } })
```

`InboxClassifier` sólo usa `mastra.getAgent('inboxClassifier')` (`inbox-classifier.ts:87` y `:97`), así que esto alcanza.

---

## Steps

### 1. `package.json` — agregar `mailparser`

**Change**: en `devDependencies` (junto a `@types/email-reply-parser`, línea 42):

```json
"mailparser": "^3.7.4",
"@types/mailparser": "^3.4.6",
```

Luego `pnpm install`.

**Why**: `mailparser` parsea `.eml` (RFC822) y expone `text` / `html` ya decodificados, sin tener que reimplementar decodificación de `quoted-printable` / `base64` en los tests.

---

### 2. Fixtures — `tests/fixtures/mails/*.eml`

Crear 5 archivos `.eml` en formato RFC822 crudo (headers + línea vacía + body). Contenido en español, coherente con los dominios del proyecto (pañales / medicamentos / reintegros).

| Archivo | Forma | Qué ejercita |
|---|---|---|
| `confirmacion-entrega.eml` | `text/plain` simple | Happy path, outcome específico |
| `error-envio.eml` | `text/plain` | Segundo outcome específico (no todo cae en catch-all) |
| `mail-html.eml` | `multipart/alternative` con **sólo** `text/html` (tabla con `<td>`) | Rama HTML de `stripMailBody` (`strip-mail-body.ts:16-25`), incluido el `append(' ')` que separa celdas |
| `mail-con-quoted.eml` | `text/plain` con bloque `On ... wrote:` / `>` citado | `EmailReplyParser().getVisibleText()` (`strip-mail-body.ts:14`) |
| `mail-generico.eml` | `text/plain` (newsletter irrelevante) | Catch-all |

Notas de construcción:
- `mail-html.eml` debe ser `multipart/alternative` con boundary y **sin** parte `text/plain`, si no `stripMailBody` corta en la rama plain y nunca prueba cheerio.
- En `mail-con-quoted.eml` la línea nueva debe ir **arriba** del bloque citado, que es lo que espera `email-reply-parser`.
- Usar `\n` como line ending; `mailparser` lo tolera.

---

### 3. Helper — `tests/fixtures/mails/eml-to-gmail-payload.ts`

Exportar:

```ts
export async function emlToGmailPayload(fixtureName: string): Promise<GmailPayload>
export async function readFixtureText(fixtureName: string): Promise<string>
```

Implementación:
1. Leer el `.eml` desde `tests/fixtures/mails/` resolviendo con `new URL(`./${name}`, import.meta.url)` (ESM, `"type": "module"`).
2. `simpleParser(buffer)` de `mailparser`.
3. Si `parsed.text` existe → devolver `{ mimeType: 'text/plain', body: { data: base64url(parsed.text) } }`.
4. Si no, y existe `parsed.html` → `{ mimeType: 'text/html', body: { data: base64url(parsed.html) } }`.
5. Encoding: `Buffer.from(s, 'utf-8').toString('base64url')` — igual que `decode()` en `strip-mail-body.ts:41`.

**Why**: `stripMailBody` recibe el `payload` de `messages.get(format: 'full')`; el helper cierra la brecha entre `.eml` en disco y esa forma. Devolver una parte plana (no multipart) está bien porque `findPart` (`strip-mail-body.ts:30`) recorre recursivamente y matchea también el nodo raíz.

**Nota**: `mailparser` normaliza a `parsed.text` incluso cuando el `.eml` es sólo HTML (lo deriva). Para que `mail-html.eml` ejercite de verdad la rama HTML, el helper debe aceptar un segundo argumento `prefer?: 'html'` que fuerce la parte `text/html`, y el test HTML lo usa explícitamente.

---

### 4. `tests/inbox-classifier.fixtures.test.ts` — suite rápido (mocks)

Reusar la estructura de `buildGmail()` / `buildMastra()` de `src/mastra/lib/inbox-classifier/inbox-classifier.test.ts:8-36`, pero con `payload` viniendo del helper.

Tests:
1. **happy path con fixture real** — `confirmacion-entrega.eml`; agente mockeado devuelve `{ query }` y `{ label: 'clasificado-entrega' }`; assert que el prompt de clasificación (`generate.mock.calls[1][0]`) contiene texto real del fixture y que `messages.modify` se llamó con el label id.
2. **segundo outcome** — `error-envio.eml` → `clasificado-error`; assert `modify` con el id del label correcto.
3. **HTML** — `mail-html.eml` con `prefer: 'html'`; assert que el prompt contiene los valores de celdas **separados por espacio** (regresión del `append(' ')`) y **no** contiene `<td` ni `<style`.
4. **quoted text** — `mail-con-quoted.eml`; assert que el prompt contiene la línea nueva y **no** contiene el texto citado.
5. **genérico** — `mail-generico.eml` → catch-all `clasificado-otro`.

Los tests 3 y 4 llaman `stripMailBody` a través del classifier (no directo) para que también cubran el cableado.

**Why**: rápidos, deterministas, corren en CI, y son los que atrapan regresiones de parseo.

---

### 5. `tests/inbox-classifier.integration.test.ts` — suite con agente real

```ts
const hasKey = Boolean(process.env.OPENROUTER_API_KEY) && process.env.OPENROUTER_API_KEY !== 'test-key'
describe.skipIf(!hasKey)('InboxClassifier (integración)', () => { ... })
```

`tests/setup-env.ts:3` setea `OPENROUTER_API_KEY ??= 'test-key'`, así que el guard debe excluir explícitamente `'test-key'`.

Setup:
- `const mastra = new Mastra({ agents: { inboxClassifier: inboxClassifierAgent } })` — **no** importar `src/mastra/index.ts` (ver corrección arriba).
- Gmail sigue mockeado (no queremos tocar una cuenta real); sólo el agente es real.
- `timeout: 60_000` a nivel `describe`.

Tests:
1. **clasifica correctamente cada fixture** — `it.each` sobre `[fixture, labelEsperado]` para los 5 fixtures; assert que `modify` recibió el label id correspondiente al label esperado. Usar `resolveLabelId` mockeado para devolver un id por nombre y así poder mapear id → label en el assert.
2. **traduce la query** — `init()` con `queryDescription: 'mails de farmacia@proveedor.test de los últimos 30 días'`; assert que la query generada matchea `/from:/` y `/newer_than:30d/`.

**Why**: verifica que las `description` de los outcomes y las instructions del agente (`inbox-classifier-agent.ts:10-16`) realmente producen la clasificación esperada — cosa que un mock nunca puede validar.

---

## Verification

- `pnpm test` → suite rápido verde; el de integración **skipeado** (porque `setup-env.ts` fuerza `test-key`).
- `pnpm test` con `OPENROUTER_API_KEY` real exportado en el entorno → 7 tests extra corriendo y verdes.
- `pnpm typecheck` → verde. **Ojo**: según `docs/superpowers/followups.md`, `tsconfig.json` no incluye `tests/`, así que `typecheck` puede *no* cubrir los archivos nuevos. Confirmar leyendo `tsconfig.json`; si `tests/` está fuera, la verificación de tipos efectiva es que `vitest` (esbuild) no rompa en runtime.
- Los tests existentes en `src/mastra/lib/inbox-classifier/inbox-classifier.test.ts` deben seguir pasando sin cambios.

### Qué puede salir mal

- `mailparser` deriva `parsed.text` desde HTML → el test de HTML pasaría sin ejercitar cheerio. Mitigado con el flag `prefer: 'html'`; verificar que el prompt asertado **no** contenga tags.
- `email-reply-parser` es sensible al formato del separador de cita. Si el test de quoted falla, ajustar el `.eml` a la forma canónica `On <fecha>, <nombre> <mail> wrote:`.
- La clasificación real puede ser no determinista en el fixture catch-all. Si es flaky, afinar la `description` del outcome catch-all en el config del test (no en `src/`) o marcar ese caso concreto como tolerante.
- Convención de estilo en archivos nuevos: single quotes, sin punto y coma, indentación de 4 espacios (como `inbox-classifier.test.ts`).
