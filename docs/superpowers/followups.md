# Follow-ups pendientes

Lista viva de pendientes que no bloquean el trabajo ya commiteado. Origen: reviews de la feature de identidad de usuarios (spec `specs/2026-07-21-user-identity-design.md`, plan `plans/2026-07-21-user-identity.md`) y del agregado de Google auth (2026-07-22).

## Bloqueantes para dar por cerrada la feature de identidad

- [ ] **Rollout de identidad canónica + E2E manual** (specs 2026-07-21 y 2026-07-22; requiere dos cuentas de Telegram):
  1. Limpiar data de prueba: drop de las colecciones `users` e `invites` viejas (keyed por telegramId), drop de las colecciones de storage de Mastra (threads/messages en el Mongo storage de Mastra) para que no sobrevivan threads viejos a nombre de `telegram:<id>` (`resolveResourceId` solo corre al crear un thread, no migra los existentes), y borrar los JSON de suscriptores (`*-subscribers.json` en `src/mastra/public/`).
  2. `.env`: `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_TELEGRAM_ID` (nunca con valor vacío: zod valida `min(...)` y rompe el boot).
  3. Verificar: desconocido ignorado en silencio (DM, mención en grupo); invitar con email crea el user en Mongo; el canje del deep link vincula `telegramId`; el thread nuevo de memoria queda a nombre del email (visible en Studio); link usado no se reusa; member no puede invitar; un pedido muestra `requestedBy`.
- [ ] **Activar Google auth**: OAuth client tipo "Web application" en Google Cloud Console con redirect `https://<NGROK_DOMAIN>/api/auth/sso/callback`; completar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_COOKIE_PASSWORD` (32+ chars) en `.env`. La autorización es por colección `users` (invitado = acceso a bot y web). Probar login en Studio con el admin y que una cuenta no invitada reciba 401.
- [ ] **Cerrar la rama `feat/refactor`**: merge a `main` o PR, cuando el E2E esté verde.

## Diferidos de las reviews (mejoras, no bloquean)

- [x] Índices únicos en Mongo: `users.email`, `users.telegramId` (sparse) e `invites.code` — hecho: se crean idempotentemente en `ensureAdminSeed()` (boot, corre siempre ahora, incluso sin `ADMIN_EMAIL`) y en `createInvite()` (antes del insert).
- [ ] Incluir `requestedBy` en los payloads de los `sendNotificationSignal` de los tres notify steps (hoy el nombre está en el estado y el agente puede decirlo si le preguntan, pero el aviso no nombra a quién pidió).
- [ ] Compensación si `linkTelegramId` falla (no matchea ningún user) después de `redeemInvite`: el invite queda quemado sin vincular; el gate ahora lo detecta, loguea un warning y no deja pasar al agente, pero el código no se puede reusar (ventana milimétrica; el admin puede regenerar el invite). Posible fix: try/catch que haga `$unset` de `usedBy`.
- [ ] `ensureAdminSeed()` usa `$setOnInsert`: cambiar `ADMIN_NAME` en `.env` con el admin ya creado es un no-op silencioso.
- [ ] Doble pool de Mongo: `lib/mongo-client.ts` abre su propio `MongoClient` además del interno de `MongoDBStore` (misma URI); sin `close()` en shutdown. Consolidar algún día.
- [ ] El gate compara contra `users.telegramId` pero está registrado a nivel `channels.handlers` (aplica a todo adapter): si algún día se suma otro canal, ese canal queda bloqueado en silencio (fail closed). Documentado en comentario; revisar al agregar adapters.
- [ ] Test de orden en el gate: nada asegura que `linkTelegramId` corra solo tras un `redeemInvite` exitoso si se refactoriza a concurrente.
- [ ] Casts `context.mastra as any` preexistentes en las request tools.

## Futuro (fuera de alcance por decisión de spec)

- ~~Identidad canónica cross-canal~~ → hecho el 2026-07-22 (spec `2026-07-22-canonical-identity-design.md`): email de Google como ID canónico, invites nominados, `resolveResourceId` en DMs. Queda para el futuro: otros proveedores de identidad, cambio de email de un usuario (migración manual), cache en `authorizeUser` si el login se pone lento.
- Roles finos por flujo, revocación de usuarios y administración avanzada.
