# Polling de la casilla de correo

Fecha: 2026-07-27

## Problema

Hoy los workflows de `diapers`, `meds` y `refunds` se reanudan a través de seis rutas
HTTP (`src/mastra/routes/webhook-*.route.ts`). Ese diseño asume un worker externo que lee
la casilla, interpreta el mail y llama al webhook con el payload ya parseado. Ese worker
nunca se construyó.

Al darle a mostro acceso a su propia casilla, el worker externo deja de tener sentido: el
mismo proceso puede leer el mail y reanudar el run en memoria, sin pasar por HTTP.

Gmail ofrece push notifications (`watch`), pero no garantizan entrega, no reintentan y el
registro expira. No sirven como única fuente. Este spec define el polling, que es el
mecanismo confiable. Las push notifications quedan fuera de alcance y podrían sumarse
después como atajo de latencia sobre esta misma base.

## Alcance

Entra:

- Tres workflows de polling con schedule nativo de Mastra, uno por dominio.
- Un helper compartido con la mecánica de leer, extraer, reanudar y etiquetar.
- Un agente de extracción que convierte prosa en los campos de resume.
- Aviso por Telegram cuando un mail no se puede procesar.
- Un tool por dominio, restringido a admins, para devolver un mail trabado a la cola.
- Borrado de las seis rutas HTTP de resume.

No entra:

- Push notifications de Gmail.
- Cambios en los workflows de dominio: los steps, schemas y funciones de resume quedan
  como están.
- Darle a mostro capacidad de redactar mails libres. El envío sigue siendo por templates.

## Los seis puntos de resume

| Dominio | Función (`src/mastra/lib/*-run.ts`) | Step esperado | Schema de resume |
|---|---|---|---|
| diapers | `confirmDiapersDate` | `wait-diapers-confirmation` | `waitDiapersConfirmationResumeSchema` |
| meds | `acknowledgeMedsOrder` | `wait-meds-acknowledge` | `waitMedsAcknowledgeResumeSchema` (vacío) |
| meds | `confirmMedsDelivery` | `wait-meds-confirmation` | `waitMedsConfirmationResumeSchema` |
| refunds | `acknowledgeRefund` | `wait-refund-ack` | `waitRefundAckResumeSchema` (vacío) |
| refunds | `confirmRefund` | `wait-refund-confirmation` | `waitRefundConfirmationResumeSchema` |
| refunds | `receiveDeposit` | `wait-deposit` | `waitDepositResumeSchema` |

Meds tiene dos etapas y refunds tres. Los dos schemas de acuse son `z.object({})`: el
acuse no aporta datos, solo destraba el workflow.

## Decisión central: el ruteo lo determina el step suspendido

Un remitente manda mails de distinto tipo según el momento. Un mail de la farmacia puede
ser el acuse del pedido o la confirmación de la entrega, y puede ser ambiguo entre los
dos:

> "Recibimos su pedido. Se lo entregamos el miércoles 11/03."

Ese mail contiene un acuse y una fecha de entrega a la vez. Si el LLM decide de cuál de
las dos etapas se trata, un error de clasificación reanuda el step equivocado y saltea una
etapa del workflow.

En su lugar, el estado decide. Antes de llamar al modelo, el poller lee el run del mes y
consulta `reader.getSuspendedStep()`. Ese step determina qué schema se extrae y qué
función de resume se llama. Al modelo se le hace una pregunta cerrada: *este mail, ¿es lo
que este step espera? Si sí, extraé estos campos; si no, decí por qué no.*

Es la misma verificación que ya hacen las funciones de resume
(`src/mastra/lib/diapers-run.ts:77-81`), usada antes de llamar al modelo en lugar de solo
para rechazar después. Como consecuencia, el resultado `wrong_step` se vuelve inalcanzable
desde el poller: el step lo leyó el propio poller, no llegó de afuera.

El LLM queda haciendo lo único que no se resuelve con código: leer castellano y sacarle
una fecha, una cantidad y un domicilio.

## Arquitectura

Tres workflows independientes, uno por dominio. Cada dominio recibe mails de un remitente
distinto, así que no hay ambigüedad entre dominios y no hace falta ningún dispatcher ni
tabla de ruteo central.

```
src/mastra/lib/inbox/
  gmail-reader.ts       buscar, leer y etiquetar mails
  poll-mailbox.ts       el ciclo compartido
  mail-extractor.ts     el agente de extracción

src/mastra/workflows/diapers/diapers-poll.workflow.ts
src/mastra/workflows/meds/meds-poll.workflow.ts
src/mastra/workflows/refunds/refunds-poll.workflow.ts

src/mastra/tools/diapers-retry-failed-mail-tool.ts
src/mastra/tools/meds-retry-failed-mail-tool.ts
src/mastra/tools/refunds-retry-failed-mail-tool.ts
```

Cada poller es configuración sobre el helper:

```ts
export const refundsPollWorkflow = createWorkflow({
  id: 'refunds-poll',
  schedule: {
    cron: '*/15 * * * *',
    timezone: 'America/Argentina/Buenos_Aires',
  },
})
  .then(pollMailbox({
    domain: 'refunds',
    sender: appConfig.REFUNDS_SENDER,
    workflowId: 'refundsWorkflow',
    getRunId: getRefundsRunId,
    steps: {
      'wait-refund-ack': {
        schema: waitRefundAckResumeSchema,
        resume: acknowledgeRefund,
        description: 'un acuse de recibo del pedido de reembolso',
      },
      'wait-refund-confirmation': {
        schema: waitRefundConfirmationResumeSchema,
        resume: confirmRefund,
        description: 'la confirmación de que el reembolso fue aprobado',
      },
      'wait-deposit': {
        schema: waitDepositResumeSchema,
        resume: receiveDeposit,
        description: 'el aviso de que el dinero fue depositado',
      },
    },
  }))
  .commit()
```

El campo `description` es lo que el extractor le muestra al modelo para que sepa qué está
buscando.

El scheduler de Mastra corre como un `setInterval` sobre la tabla de schedules, así que
requiere un host de larga duración. Mostro ya corre así. En serverless habría que pasar a
`@mastra/inngest`, que queda fuera de alcance.

Forzar un ciclo a mano es llamar `.start()` sobre el workflow, desde Studio o desde código.
No hace falta una ruta HTTP para eso.

## El ciclo

Query de Gmail:

```
from:<sender> -label:mostro-processed -label:mostro-failed newer_than:30d
```

`newer_than:30d` evita que el primer ciclo barra el histórico completo de la casilla.

Después, **por cada mail**:

1. Resolver el run del mes con `getRunId(yearMonth)` y leer su step suspendido.
2. Si no hay run, o no está suspendido, o el step no figura en el mapa del dominio:
   marcar `mostro-failed` con el motivo y avisar.

Sobre qué mes: los runs están scopeados por `YYYY-MM` (`src/mastra/lib/date-scope.ts`), pero
el mail de respuesta no siempre cae en el mismo mes que el pedido. Un pedido abierto el 30 de
julio se puede confirmar el 2 de agosto, y buscar solo el mes corriente lo mandaría a
`mostro-failed` sin razón. El poller prueba el mes del mail y, si ahí no hay un run suspendido,
prueba el mes anterior. Si ninguno de los dos tiene un run suspendido, el mail falla.
3. Extraer con el agente, usando el schema y la descripción de ese step.
4. Si el extractor responde que el mail no corresponde a ese step: marcar `mostro-failed`
   con el motivo que dio el modelo y avisar.
5. Llamar la función de resume del step. Si devuelve `ok`, marcar `mostro-processed`. Si
   falla, marcar `mostro-failed` con el motivo y avisar.

El paso 1 se ejecuta **por mail, no una vez por ciclo**. Si en una misma tanda llegan el
acuse y la confirmación de entrega, procesar el acuse avanza el run a la etapa siguiente,
y el segundo mail tiene que evaluarse contra el step nuevo. Leer el step una sola vez al
principio manda el segundo mail a `mostro-failed` sin motivo real.

Los mails se procesan en orden cronológico ascendente, para que un acuse anterior no se
evalúe después de una confirmación posterior.

## Etiquetas

- `mostro-processed`: el mail reanudó su workflow. Terminal.
- `mostro-failed`: el mail no se pudo procesar. Sale de la cola y no se reintenta solo.

Las dos se crean en la casilla si no existen, en el primer ciclo.

Que un mail quede en `mostro-failed` y nadie haga nada equivale a descartarlo: el query lo
excluye para siempre. No hace falta una acción de descarte. Solo vuelve a la cola lo que un
admin devuelve a propósito.

## El extractor

Un único agente compartido por los tres dominios, sin tools y sin memoria. Solo lee prosa y
devuelve campos.

La salida se envuelve para que el modelo pueda decir que el mail no corresponde:

```ts
z.object({
  matches: z.boolean(),
  reason: z.string(),
  data: stepSchema.optional(),
})
```

`reason` se completa siempre: cuando `matches` es `false` explica por qué, y es el texto que
va al aviso de Telegram.

Se usa `errorStrategy: 'strict'`. Si el modelo devuelve algo que no valida contra el schema,
es un fallo del mail, no un dato dudoso que se filtra al resume.

Para los dos steps de acuse, cuyo schema es `z.object({})`, la extracción se reduce a
`matches`: el modelo solo determina si el mail es un acuse. No hay campos que sacar.

## Fallos

Cuando un mail queda en `mostro-failed`, el aviso va a **todos** los suscriptores del
dominio, con `subscriberRepository.list(domain)` y `resolveTelegramThread`, igual que
`src/mastra/workflows/diapers/steps/notify-diapers-confirmation.step.ts:15-21`.

Se emite con `sendNotificationSignal` y conserva el encuadre de aviso del sistema que ya
usan las notificaciones existentes:

> `[AVISO DEL SISTEMA — NO es un mensaje del usuario, NO requiere acción] Reenviá este
> aviso tal cual en texto plano, sin delegar ni usar tools: ...`

Sin ese prefijo el supervisor interpreta la notificación como una tarea e intenta actuar
sobre ella en vez de reenviarla.

El aviso incluye remitente, asunto, motivo del fallo, y la aclaración de que un admin puede
pedir el reintento.

El motivo tiene que alcanzar para decidir si reintentar sirve. Un mail que falló porque no
había ningún pedido abierto ese mes va a volver a fallar si se lo reintenta sin más; sirve
reintentarlo recién cuando alguien abrió el pedido que faltaba, o cuando el fallo fue
transitorio.

## Reintento

Un tool por dominio, siguiendo el patrón de los `*-get-status-tool` existentes. Le saca el
label `mostro-failed` a los mails trabados de su dominio y los devuelve a la cola; el
próximo ciclo los levanta.

El gate replica el de `src/mastra/tools/create-invite-tool.ts:25-27`:

```ts
const caller = await getUserByResourceId(resourceId)
if (!caller || caller.role !== 'admin') {
    return { ok: false, error: 'only admins can retry failed mails' }
}
```

Un miembro sin rol de admin recibe el aviso del fallo, pero si le pide a mostro que lo
reintente, el tool se lo niega.

Cada tool se registra en el agente de su dominio.

## Registro

Los tres workflows de polling y el agente extractor se registran en `src/mastra/index.ts`,
junto a los que ya están. Sin eso el scheduler no los ve al arrancar y no corren nunca.

## Autenticación

El cliente de Gmail existente (`src/mastra/lib/mailer/gmail-mailer.ts:11`) se reutiliza; se
extrae a un módulo compartido para que el reader y el mailer usen el mismo.

El scope pasa de solo envío a `gmail.modify`, que habilita leer y etiquetar. Hay que
re-autorizar con el script de auth existente y reemplazar `GMAIL_MAILER_REFRESH_TOKEN`.

Gmail no ofrece scopes acotados por label: `gmail.modify` alcanza toda la casilla. La
contención no viene del scope sino del código. El poller solo consulta un query fijo
construido a partir del remitente configurado, y los handlers solo pueden invocar funciones
de resume predefinidas. El modelo nunca elige a quién escribirle ni qué step reanudar.

Los tres remitentes se agregan a `app.config.ts` como variables requeridas:
`DIAPERS_SENDER`, `MEDS_SENDER`, `REFUNDS_SENDER`.

## Lo que se borra

Las seis rutas y su registro en `src/mastra/index.ts:54-61`:

- `webhook-diapers.route.ts`
- `webhook-meds-ack.route.ts`
- `webhook-meds-confirm.route.ts`
- `webhook-refunds-ack.route.ts`
- `webhook-refunds-confirmation.route.ts`
- `webhook-refunds-deposit.route.ts`

Con sus tests. Las funciones de `src/mastra/lib/*-run.ts` quedan intactas: son la capa de
resume y ahora las llama el poller en proceso. Sus tests también quedan.

El túnel de ngrok sigue siendo necesario para Telegram.

## Testing

El helper `pollMailbox` recibe el lector de Gmail y el extractor por parámetro, así que se
testea con fakes, sin red ni LLM. Los casos que cubre:

- Un mail que corresponde al step suspendido: reanuda y queda `mostro-processed`.
- Un mail que no corresponde: queda `mostro-failed` y dispara el aviso.
- No hay run abierto para el mes: queda `mostro-failed` y dispara el aviso.
- Un mail que llega el mes siguiente al del pedido: se resuelve contra el run del mes
  anterior y reanuda igual.
- El run está suspendido en un step que no está en el mapa: queda `mostro-failed`.
- La función de resume falla: queda `mostro-failed`.
- Dos mails en la misma tanda que avanzan el workflow dos etapas: el segundo se evalúa
  contra el step actualizado, no contra el inicial.
- Un mail ya etiquetado no vuelve a aparecer en el query.

Los tools de reintento se testean como los existentes: llamador admin y llamador member.

El extractor no se testea contra un modelo real. Lo que se verifica es que el wrapper
`matches` / `reason` / `data` se interpreta bien y que `errorStrategy: 'strict'` convierte
una salida inválida en un fallo del mail.

## Alternativas descartadas

**Un solo poller con tabla de ruteo por remitente.** Necesario si dos dominios compartieran
casilla, pero cada dominio tiene su remitente propio. Con tres pollers independientes no hay
dispatcher, la configuración vive pegada a su workflow, y un fallo en un dominio no frena a
los otros.

**Que el LLM clasifique la etapa.** Descartado por el mail ambiguo descrito arriba: un error
de clasificación reanuda el step equivocado.

**Parseo determinístico con regex.** Frágil ante el primer cambio de formato del remitente, y
hay que escribir un parser por cada uno.

**historyId de Gmail en lugar de labels.** Más barato en llamadas, pero un ciclo que falla a
la mitad pierde su ventana y no hay forma simple de reprocesar un mail puntual.

**Registro de procesados en MongoDB.** Funciona y evita pedir `gmail.modify`, pero el estado
queda invisible desde el cliente de mail y hay que limpiarlo con el tiempo. Los labels se ven
y se manipulan desde Gmail.

**Filtro nativo de Gmail que etiqueta la cola.** Deja configuración fuera del repo que hay que
recordar replicar. El query se arma solo a partir del remitente configurado.
