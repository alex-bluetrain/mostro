# Follow-ups pendientes

Lista viva de pendientes que no bloquean el trabajo ya commiteado. Origen: reviews de la feature de identidad de usuarios (spec `specs/2026-07-21-user-identity-design.md`, plan `plans/2026-07-21-user-identity.md`) y del agregado de Google auth (2026-07-22).

## Bloqueantes para dar por cerrada la feature de identidad

- [ ] **E2E manual por Telegram** (Task 10 del plan, requiere dos cuentas): desconocido ignorado en silencio; deep link registra + pide nombre; link usado no se reusa; member no puede generar invitaciones; un pedido muestra `requestedBy`. Requiere `ADMIN_TELEGRAM_ID`/`ADMIN_NAME` en `.env`.
- [ ] **Activar Google auth**: OAuth client tipo "Web application" en Google Cloud Console con redirect `https://<NGROK_DOMAIN>/api/auth/sso/callback`; completar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_COOKIE_PASSWORD` (32+ chars), `GOOGLE_ALLOWED_EMAILS` en `.env` (nunca con valor vacío: el schema zod los valida `min(1)` y rompe el boot). Probar login en Studio y que un no-listado reciba 401.
- [ ] **Cerrar la rama `feat/refactor`**: merge a `main` o PR, cuando el E2E esté verde.

## Diferidos de las reviews (mejoras, no bloquean)

- [ ] Índices únicos en Mongo: `users.telegramId` e `invites.code` (hoy la unicidad depende de la disciplina del upsert / azar de 72 bits). Sugerencia del reviewer: crearlos en `ensureAdminSeed()` renombrándolo a algo tipo `ensureUsersInit()`.
- [ ] Incluir `requestedBy` en los payloads de los `sendNotificationSignal` de los tres notify steps (hoy el nombre está en el estado y el agente puede decirlo si le preguntan, pero el aviso no nombra a quién pidió).
- [ ] Compensación si `createUser` falla después de `redeemInvite`: el invite queda quemado sin usuario creado (ventana milimétrica; el admin puede regenerar). Posible fix: try/catch que haga `$unset` de `usedBy`.
- [ ] `ensureAdminSeed()` usa `$setOnInsert`: cambiar `ADMIN_NAME` en `.env` con el admin ya creado es un no-op silencioso.
- [ ] Doble pool de Mongo: `lib/mongo-client.ts` abre su propio `MongoClient` además del interno de `MongoDBStore` (misma URI); sin `close()` en shutdown. Consolidar algún día.
- [ ] El gate compara contra `users.telegramId` pero está registrado a nivel `channels.handlers` (aplica a todo adapter): si algún día se suma otro canal, ese canal queda bloqueado en silencio (fail closed). Documentado en comentario; revisar al agregar adapters.
- [ ] Test de orden en el gate: nada asegura que `createUser` corra solo tras un `redeemInvite` exitoso si se refactoriza a concurrente.
- [ ] Casts `context.mastra as any` preexistentes en las request tools.

## Futuro (fuera de alcance por decisión de spec)

- Identidad canónica cross-canal (userId propio + `resolveResourceId`) cuando llegue la web React: tabla de mapeo `webUser ↔ telegramId` y decisión sobre migrar memoria. El Google auth ya instalado sirve de base de autenticación web.
- Roles finos por flujo, revocación de usuarios y administración avanzada.
