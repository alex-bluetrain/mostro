# Inbox Classifier (etapa 1)

## Contexto

El motor de polling existente (`src/mastra/lib/inbox/*`) resuelve un problema específico: reanudar
workflows suspendidos (diapers/meds/refunds) cuando llega el mail de respuesta esperado. Este
documento describe una pieza **nueva y aislada**, sin relación de código con esa carpeta: un
clasificador de inbox genérico y agnóstico, parametrizable por configuración, que no conoce labels,
queries ni dominios de negocio de antemano.

Es la **primera etapa** de un plan de dos etapas. Esta etapa entrega solo la clase `InboxClassifier`
(construcción, traducción de query, ciclo de clasificación y etiquetado), testeada con mocks. No
incluye ningún disparador (cron, tool, workflow) — eso es la etapa 2 u otra conversación.

No se modifica ningún archivo existente del repo.

## Ubicación

```
src/mastra/
├── agents/
│   └── inbox-classifier-agent.ts       # inboxClassifierAgent
└── lib/
    └── inbox-classifier/
        ├── inbox-classifier.ts          # clase InboxClassifier
        ├── inbox-classifier.test.ts
        ├── strip-mail-body.ts           # parseo MIME propio + cheerio/email-reply-parser
        └── strip-mail-body.test.ts
```

`index.ts` registra `inboxClassifierAgent` como `inboxClassifier` en el mapa `agents` (mismo patrón
que `mailExtractor: mailExtractorAgent`), para que se acceda con `mastra.getAgent('inboxClassifier')`.

## Config

```ts
export type ClassifierOutcome = {
    label: string
    description: string
}

export type InboxClassifierConfig = {
    queryDescription: string       // NL: qué mails traer (traducido una vez a query de Gmail)
    outcomes: ClassifierOutcome[]  // uno de ellos debe ser el catch-all, descrito en NL
}
```

`InboxClassifier` no conoce sintaxis de Gmail, ni labels de negocio, ni eventos: todo entra por esta
config agnóstica.

## Clase `InboxClassifier`

```ts
export type GmailClient = ReturnType<typeof gmail>

export class InboxClassifier {
    private query: string | undefined
    private readonly gmail: GmailClient

    constructor(
        private readonly mastra: unknown,
        private readonly config: InboxClassifierConfig,
        gmailClientOverride?: GmailClient,
    ) {
        if (gmailClientOverride) {
            this.gmail = gmailClientOverride
        } else {
            const oauth2 = new auth.OAuth2(appConfig.GMAIL_MAILER_CLIENT_ID, appConfig.GMAIL_MAILER_CLIENT_SECRET)
            oauth2.setCredentials({ refresh_token: appConfig.GMAIL_MAILER_REFRESH_TOKEN })
            this.gmail = gmail({ version: 'v1', auth: oauth2 })
        }
    }

    async init(): Promise<void> {
        this.query = await translateQuery(this.mastra, this.config.queryDescription)
    }

    async run(): Promise<void> {
        if (!this.query) throw new Error('InboxClassifier: llamá a init() antes de run()')

        const { data } = await this.gmail.users.messages.list({ userId: 'me', q: this.query })
        const ids = (data.messages ?? []).map(m => m.id).filter((id): id is string => Boolean(id)).reverse()

        for (const id of ids) {
            try {
                const { data: raw } = await this.gmail.users.messages.get({ userId: 'me', id, format: 'full' })
                const text = stripMailBody(raw.payload)
                const label = await classify(this.mastra, text, this.config.outcomes)
                await this.applyLabel(id, label)
            } catch (error) {
                console.warn(`[inbox-classifier] no pude clasificar/etiquetar ${id}`, error)
                // TODO: notificar el fallo (placeholder para etapa futura)
            }
        }
    }

    private async resolveLabelId(label: string): Promise<string> {
        const { data } = await this.gmail.users.labels.list({ userId: 'me' })
        const existing = data.labels?.find(l => l.name === label)
        if (existing?.id) return existing.id

        const created = await this.gmail.users.labels.create({
            userId: 'me',
            requestBody: { name: label, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
        })
        if (!created.data.id) throw new Error(`Gmail no devolvió id para el label "${label}"`)
        return created.data.id
    }

    private async applyLabel(messageId: string, label: string): Promise<void> {
        const labelId = await this.resolveLabelId(label)
        await this.gmail.users.messages.modify({
            userId: 'me',
            id: messageId,
            requestBody: { addLabelIds: [labelId] },
        })
    }
}
```

Notas de diseño:

- **Constructor síncrono**: arma el cliente Gmail (u OAuth2 propio, vía `appConfig` — mismas env vars
  que `gmail-client.ts` pero sin importarlo) en el momento de instanciar, sin lazy-init. Si se pasa
  `gmailClientOverride`, se usa ese en vez de armar uno real — así se inyecta el mock en tests.
- **`init()` separado del constructor**: la traducción de `queryDescription` a query real de Gmail
  requiere un LLM (async), y los constructores de TS no pueden ser async. `init()` se llama una sola
  vez por instancia y cachea el resultado en `this.query`. Llamar `run()` sin `init()` previo lanza.
- **`resolveLabelId` como método de instancia** (no función suelta): hoy no cachea, pero queda
  preparado para agregar cache de label→id por instancia en el futuro sin cambiar la forma.
- **`run()` totalmente secuencial**: un solo `list()`, después un loop `for...of` — nada en paralelo.
  Los ids se invierten (`reverse()`) porque Gmail devuelve `list()` de más nuevo a más viejo y no
  hay parámetro de orden ascendente en la API; invertir alcanza para procesar de más viejo a más
  nuevo sin necesitar ordenar por fecha.
- **Un fallo nunca frena el loop**: cada mail se procesa dentro de su propio `try/catch`; un error en
  cualquier paso (get, strip, classify, label) solo loguea `console.warn` y sigue con el próximo id.
  Notificar el fallo (en vez de solo loguearlo) queda como TODO explícito para una etapa futura.

## `strip-mail-body.ts`

```ts
import * as cheerio from 'cheerio'
import EmailReplyParser from 'email-reply-parser'

type Payload = {
    mimeType?: string | null
    body?: { data?: string | null } | null
    parts?: Payload[]
}

export function stripMailBody(payload: unknown): string {
    const root = payload as Payload | undefined

    const plain = findPart(root, 'text/plain')
    if (plain) return new EmailReplyParser().read(decode(plain)).getVisibleText()

    const html = findPart(root, 'text/html')
    if (html) return cheerio.load(decode(html)).text()

    return ''
}

function findPart(payload: Payload | undefined, mimeType: string): Payload | null {
    if (!payload) return null
    if (payload.mimeType === mimeType && payload.body?.data) return payload
    for (const part of payload.parts ?? []) {
        const found = findPart(part, mimeType)
        if (found) return found
    }
    return null
}

function decode(part: Payload): string {
    return Buffer.from(part.body?.data ?? '', 'base64url').toString('utf-8')
}
```

- Reimplementa el recorrido MIME desde cero — no importa nada de `gmail-message.ts`.
- Prioridad: si existe una parte `text/plain` a cualquier profundidad, se usa esa (con
  `email-reply-parser`, que corta firma/citas) y se ignora el html. Solo cae a `text/html` (con
  `cheerio.load(...).text()`, sin pasar después por `email-reply-parser`) si no hay ninguna parte
  plain. Si no hay ninguna de las dos, devuelve `''`.
- Dependencias nuevas a instalar: `cheerio` (^1.2.0), `email-reply-parser` (^2.3.9) +
  `@types/email-reply-parser` (^1.4.2).

## Agente Mastra (`inbox-classifier-agent.ts`)

Un solo agente para las dos tareas (traducir query, clasificar), sin helper compartido — cada función
llama `mastra.getAgent('inboxClassifier')` inline:

```ts
export const inboxClassifierAgent = new Agent({
    id: 'inbox-classifier-agent',
    name: 'Inbox Classifier',
    description: 'Traduce descripciones en lenguaje natural a queries de Gmail y clasifica mails contra un conjunto de posibles resultados.',
    instructions: `...`,
    model: 'openrouter/deepseek/deepseek-v4-flash',
})
```

```ts
async function translateQuery(mastra: unknown, queryDescription: string): Promise<string> {
    const agent = (mastra as { getAgent: (id: string) => { generate: Function } }).getAgent('inboxClassifier')
    const schema = z.object({ query: z.string() })
    const prompt = `Convertí esta descripción a una query de búsqueda de Gmail (sintaxis de users.messages.list: from:, newer_than:, label:, -label:, etc.).

Descripción: ${queryDescription}`
    const response = await agent.generate(prompt, { structuredOutput: { schema, errorStrategy: 'strict' } })
    return schema.parse(response.object).query
}

async function classify(mastra: unknown, text: string, outcomes: ClassifierOutcome[]): Promise<string> {
    const agent = (mastra as { getAgent: (id: string) => { generate: Function } }).getAgent('inboxClassifier')
    const labels = outcomes.map(o => o.label) as [string, ...string[]]
    const schema = z.object({ label: z.enum(labels) })
    const prompt = `Clasificá este mail contra los siguientes resultados posibles. Elegí exactamente uno.

${outcomes.map(o => `- ${o.label}: ${o.description}`).join('\n')}

Mail:
${text}`
    const response = await agent.generate(prompt, { structuredOutput: { schema, errorStrategy: 'strict' } })
    return schema.parse(response.object).label
}
```

- Sin chequeo de "agente no registrado": `mastra.getAgent(id)` ya lanza sola si el id no está
  registrado (comportamiento confirmado del SDK de Mastra instalado), no hace falta envolverlo.
- `z.enum` sobre los labels de `outcomes` obliga al modelo a devolver siempre uno de los outcomes
  configurados — nunca inventa un label nuevo. Uno de los outcomes actúa de catch-all, pero eso se
  resuelve en la `description` en lenguaje natural, no con lógica de código.
- Match siempre único: nunca hay ambigüedad entre varios outcomes ni "ningún outcome" — el catch-all
  en la config garantiza que siempre hay exactamente un label elegido.

## Testing

- `gmailClientOverride` en el constructor de `InboxClassifier` permite inyectar un mock del cliente
  Gmail en los tests, sin necesidad de credenciales reales.
- `strip-mail-body.test.ts` testea `stripMailBody` de forma pura, con payloads MIME de ejemplo
  (plain-only, html-only, ambos, multipart anidado, sin body).
- `inbox-classifier.test.ts` mockea `mastra.getAgent(...).generate(...)` y el cliente Gmail inyectado
  para cubrir: traducción de query en `init()`, ciclo completo de `run()` (list → get → strip →
  classify → label), orden de procesamiento (más viejo a más nuevo), resolución/creación de label,
  y que un fallo en un mail no corte el procesamiento de los siguientes.

## Fuera de alcance (etapa 2 o futuro)

- Disparador: cron, tool o workflow que invoque `new InboxClassifier(...).init()` + `.run()`.
- Notificación real de fallos (hoy es un `console.warn` placeholder).
- Cache de label→id entre llamadas de `resolveLabelId`.
- Paginación/`maxResults` en `messages.list`: hoy solo se procesa la primera página. Con un backlog
  de más de 100 mails, los más viejos de ese backlog nunca se clasifican.
- Exclusión de mails ya etiquetados en la query traducida: un futuro disparador que llame `run()`
  repetidamente reclasificaría todos los mails en cada corrida, no solo los nuevos.
