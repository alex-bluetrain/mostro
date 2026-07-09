# Flujo de "diapers" (pañales)

> Nota: `pregunta.md` lista el estado como `diapers_requsted` (typo), pero el código real usa `diapers_requested`. Los demás estados coinciden: `diapers_date_confirmed`, `diapers_notification_sent`.

## 1. Diagrama de secuencia (componentes + eventos)

```plantuml
@startuml diapers-sequence
skinparam sequenceMessageAlign center
skinparam maxMessageSize 160

actor "Usuario\n(Telegram)" as User
participant "mostro-supervisor" as Supervisor
participant "diapers-agent" as Agent
participant "diapers-workflow\n(runId = diapers-YYYY-MM)" as WF
participant "diapers-subscribers.json" as Subs
participant "DIAPERS_MESSAGING_URL\n(proveedor externo)" as Provider
participant "POST /webhooks/diapers" as Webhook
database "mastra.db (LibSQLStore)" as DB

User -> Supervisor: mensaje de chat\n("pedime pañales")
Supervisor -> Agent: delega (reglas de mostro-supervisor.ts)

== Suscripción (opcional, en cualquier momento) ==
User -> Supervisor: "avisame cuando lleguen"
Supervisor -> Agent: delega
Agent -> Subs: subscribeDiapersTool\n(resourceId, threadId)

== Inicio del pedido ==
Agent -> WF: requestDiapersTool\n-> startDiapers(diaperType, quantity, yearMonth)
activate WF
WF -> DB: crea/persiste run
WF -> WF: **step 1: request-diapers**\nstatus = diapers_requested
WF -> Provider: (opcional) POST {type, quantity}
note right of WF
  Si no hay run "in progress" para el mes,
  arranca uno nuevo. Si ya existe, responde
  { alreadyInProgress: true }.
end note

WF -> WF: **step 2: wait-diapers-confirmation**
WF -> WF: resumeData == null -> **suspend({})**
note right of WF #FFDDDD
  ◆◆◆ PUNTO DE PAUSA ◆◆◆
  El run queda "suspended" indefinidamente
  en mastra.db, esperando resumeData.
end note
deactivate WF

... tiempo indeterminado ...

== Reanudación (evento externo, NO Telegram) ==
Provider -> Webhook: POST /webhooks/diapers\n{ yearMonth, deliveryDate, deliveryAddress }
activate WF
Webhook -> WF: confirmDiapersDate()\n-> run.resume({ resumeData })
WF -> WF: status = diapers_date_confirmed

WF -> WF: **step 3: notify-users**
WF -> Subs: listSubscribers()
loop por cada { resourceId, threadId }
  WF -> Supervisor: sendNotificationSignal({\n  source: 'diapers', kind: 'delivery-confirmed',\n  priority: 'high', summary, payload })
  Supervisor -> User: reenvía el aviso tal cual\n(regla: nunca delegar/ejecutar tools con esto)
end
WF -> WF: status = diapers_notification_sent
deactivate WF

== Consulta de estado (en cualquier momento) ==
User -> Supervisor: "¿cómo va el pedido de pañales?"
Supervisor -> Agent: delega
Agent -> WF: getDiapersStatusTool -> readDiapersStatus(yearMonth)
WF --> Agent: status actual + step activo
Agent --> User: respuesta
@enduml
```

## 2. Diagrama de estados (máquina de estados del workflow)

```plantuml
@startuml diapers-state
[*] --> idle

idle --> diapers_requested : requestDiapersTool\n(step 1: request-diapers)

diapers_requested --> diapers_date_confirmed : POST /webhooks/diapers\n(step 2: wait-diapers-confirmation\n-> run.resume(resumeData))

state diapers_requested #FFDDDD {
  diapers_requested : ◆ SUSPENDIDO hasta que\n  llegue resumeData del webhook
}

diapers_date_confirmed --> diapers_notification_sent : notify-users\n(sendNotificationSignal a cada suscriptor)

diapers_notification_sent --> [*]
@enduml
```

## 3. Componentes involucrados

| Componente | Archivo | Rol |
|---|---|---|
| Agente | `src/mastra/agents/diapers-agent.ts` | Interpreta intención del usuario, expone 3 tools |
| Tools | `src/mastra/tools/diapers-{get-status,request,subscribe}-tool.ts` | Consultar estado, iniciar pedido, suscribirse a avisos |
| Workflow | `src/mastra/workflows/diapers/diapers.workflow.ts` | Encadena los 3 steps |
| Steps | `src/mastra/workflows/diapers/steps/*.ts` | Lógica de cada etapa |
| Helpers de ejecución | `src/mastra/lib/diapers-run.ts` | `readDiapersStatus`, `startDiapers`, `confirmDiapersDate` |
| Suscriptores | `src/mastra/lib/diapers-subscribers.ts` | JSON plano con `{resourceId, threadId}` |
| Webhook entrante | `src/mastra/routes/webhook-diapers.route.ts` | Único punto que reanuda el workflow |
| Storage | `LibSQLStore` (`mastra.db`) | Persiste estado/run del workflow |
| Supervisor | `src/mastra/agents/mostro-supervisor.ts` | Canal Telegram + delega a `diapersAgent` + reenvía notificaciones |

## 4. El punto clave: pausa y reanudación

- **Dónde se suspende**: `wait-diapers-confirmation.step.ts` — llama `await suspend({})` si no llega `resumeData`.
- **Qué lo reanuda**: exclusivamente `POST /webhooks/diapers` con `{ yearMonth, deliveryDate, deliveryAddress }` → dispara `confirmDiapersDate()` → `run.resume({ resumeData })`.
- **El usuario NO puede reanudarlo por chat** — esa etapa simula la confirmación de fecha de un proveedor/farmacia externo. Por Telegram el usuario solo puede *iniciar* el pedido (`request`) o *suscribirse* a que le avisen (`subscribe`).
- **Scope**: `runId` determinístico por mes (`diapers-YYYY-MM`) — el pedido es **compartido globalmente**, no por usuario (igual que "meds"; a diferencia de "refunds", que es por `orderId`).

## 5. Comparación rápida con los otros dos flujos análogos

| Flujo | Steps | Puntos de pausa | Scope del runId |
|---|---|---|---|
| **diapers** | 3 | 1 | por mes (`diapers-YYYY-MM`) |
| meds | 6 | 3 | por mes (`meds-YYYY-MM`) |
| refunds | 8 | 3 | por `orderId` |

Los tres comparten el mismo patrón: agente con 3 tools (`get-status`/`request`/`subscribe`), workflow Mastra con steps `wait-*` que suspenden hasta un webhook externo, steps `notify-*` que avisan a suscriptores vía `sendNotificationSignal` al supervisor, y persistencia en `LibSQLStore`.
