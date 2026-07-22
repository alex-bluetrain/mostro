# Identidad de usuarios (enfoque B: Telegram-first con allowlist)

**Fecha:** 2026-07-21
**Estado:** Aprobado

## Contexto y objetivo

Hoy mostro solo se usa vía Telegram y la identidad es la que regala el canal: `resourceId = telegram:<userId>` (default de Mastra channels) y suscripciones `{resourceId, threadId}` en archivos JSON. No existe concepto de "usuario" propio, cualquiera puede hablarle al bot, y los flujos compartidos no registran quién hizo qué.

Objetivos de este diseño:

1. **Control de acceso**: solo usuarios invitados pueden usar el bot; desconocidos son ignorados en silencio.
2. **Saber quién es quién**: los flujos compartidos (diapers/meds/refunds) registran autoría con nombre, y las notificaciones nombran personas en vez de IDs crudos.
3. Dejar una semilla razonable para la futura web con dashboard (React, posiblemente OpenUI), **sin** resolver identidad cross-canal todavía.

Decisión explícita (enfoque B): la identidad canónica sigue siendo el ID de Telegram. No se introduce un userId propio ni `resolveResourceId`. Cuando llegue la web se agregará una tabla de mapeo `webUser ↔ telegramId` y se decidirá ahí si se migra memoria. Deuda asumida a sabiendas: la memoria quedará keyed a `telegram:<id>` y unificarla después costará una migración.

Datos existentes: borrón y cuenta nueva. Threads de memoria y suscripciones actuales se descartan; no hay código de migración.

## 1. Modelo de datos

Dos colecciones nuevas en el mismo MongoDB que ya usa el storage de Mastra (no JSON files: evita el gotcha de `process.cwd()` del bundler y la web va a necesitar leer esto igual):

### `users`

```ts
{
  telegramId: string   // ID numérico de Telegram como string, clave natural
  name: string         // nombre para mostrar
  role: 'admin' | 'member'
  addedAt: number      // unix timestamp
}
```

- Sin ID canónico propio: `telegramId` es la clave (esto define al enfoque B).
- El admin inicial se siembra desde `.env` (`ADMIN_TELEGRAM_ID`, `ADMIN_NAME`): al arrancar, si no existe ese user, se crea con `role: 'admin'`.

### `invites`

```ts
{
  code: string         // aleatorio, URL-safe (apto para deep link)
  createdBy: string    // telegramId del admin que lo generó
  createdAt: number    // unix timestamp
  expiresAt: number    // unix timestamp; vencimiento por defecto: 7 días
  usedBy?: string      // telegramId del que lo canjeó; presencia = usado
}
```

- Códigos de un solo uso. Un invite es válido si `usedBy` está ausente y `expiresAt` no pasó.

Fechas siempre en unix timestamps, consistente con los workflows existentes.

## 2. Gate de acceso en Telegram

Se agrega `handlers.onDirectMessage` a la config de channels del `mostroSupervisor`:

```
mensaje entrante (DM)
  ├─ sender está en `users`        → defaultHandler(thread, message)  [flujo normal]
  └─ sender desconocido
       ├─ texto matchea /start <code> con invite válido y vigente
       │     → crear user { telegramId, role: 'member' }, marcar invite usado,
       │       responder bienvenida pidiéndole su nombre
       └─ cualquier otro mensaje   → return sin llamar defaultHandler  [silencio total]
```

- El gate corre **antes** de que el mensaje llegue al agente: un desconocido no gasta tokens ni toca memoria.
- El deep link `https://t.me/<bot>?start=CODIGO` hace que Telegram envíe `/start CODIGO` automáticamente al tocar "Start".
- Al canje, el user se crea con `name` vacío/placeholder y el handler **sí** pasa el mensaje a `defaultHandler`: el supervisor (con instrucciones sobre `/start`) da la bienvenida y le pide el nombre, que guarda con una tool nueva (`setMyNameTool`, actualiza `name` del invocante).
- Un usuario registrado que manda `/start CODIGO` va por el flujo normal (ya está registrado; el agente puede decirle que ya tiene cuenta).

**Punto a verificar en implementación:** que `/start CODIGO` llegue como texto plano por `onDirectMessage` del adapter `@chat-adapter/telegram` (todo indica que sí: es un mensaje normal de Telegram).

## 3. Invitaciones (solo admin)

Tool nueva en el supervisor: `createInviteTool`.

- Resuelve al invocante desde `context.agent.resourceId` (`telegram:<id>`) y verifica `role: 'admin'` en `users`.
- Admin → genera código, persiste el invite y devuelve el link `https://t.me/<TELEGRAM_BOT_USERNAME>?start=CODIGO` listo para reenviar.
- Member → responde que no tiene permiso (sin generar nada).
- `TELEGRAM_BOT_USERNAME` va a `.env` / `app.config.ts`.

## 4. Quién es quién en los flujos

- Helper `getUserByResourceId(resourceId)`: parsea `telegram:<id>` → busca en `users` → retorna user o null.
- Las tools de request de los flujos compartidos (`requestDiapersTool`, `requestMedsTool`, `requestRefundsTool`) resuelven el nombre del invocante y lo guardan en el estado del workflow (`requestedBy: name`).
- Las notificaciones y respuestas de estado pueden nombrar personas ("pidió Ana") en vez de IDs crudos.
- Las **suscripciones quedan como están** (`{resourceId, threadId}` en JSON): funcionan y no son parte del problema de identidad.

## 5. Fuera de alcance

- ID de usuario canónico y `resolveResourceId`.
- Autenticación/autorización web (JWT, Clerk, etc.).
- Migración de threads de memoria o suscripciones existentes.
- Roles finos por flujo (solo existe admin/member; la única capacidad diferencial del admin es generar invitaciones).
- Revocación de usuarios y administración avanzada (se puede borrar a mano en Mongo si hace falta).

## 6. Testing y verificación

**Unit tests:**

- Gate: registrado pasa / desconocido silenciado / `/start` con código válido registra / código vencido silenciado / código ya usado silenciado / registrado mandando `/start` va por flujo normal.
- Repos `users` e `invites` contra Mongo (alta, búsqueda por telegramId, canje atómico de invite).
- `createInviteTool`: admin genera, member rechazado.

**Verificación manual (Studio + Telegram real):**

- Desconocido escribe → sin respuesta.
- Deep link → registro + bienvenida + guardado de nombre.
- Admin genera invite; member intenta y es rechazado.
- Un pedido de pañales muestra `requestedBy` con el nombre correcto.

## Alternativas descartadas

- **Enfoque A — directorio con userId canónico + `resolveResourceId`**: resuelve identidad cross-canal de una, pero agrega más piezas hoy; se prefirió minimizar y pagar la migración cuando la web exista de verdad.
- **Enfoque C — IdP externo (Clerk/Supabase/Auth0)**: overkill para un grupo cerrado chico; dependencia externa sin beneficio actual.
