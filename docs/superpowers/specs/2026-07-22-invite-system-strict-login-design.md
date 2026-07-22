# Invitaciones sin pre-creación de usuario + login de Google estricto

Fecha: 2026-07-22
Estado: aprobado

## Contexto y problema

1. **El login de Google acepta a cualquiera en Studio.** El `authorizeUser` de
   `src/mastra/lib/google-auth.ts` (email debe existir en `users`) solo corre en el
   middleware que protege `/api/*`. El flujo SSO (`handleCallback` dentro de
   `@mastra/auth-google`) emite la cookie de sesión para cualquier cuenta de Google
   sin consultar `authorizeUser`, así que cualquiera completa el OAuth y entra a la
   UI de Studio.
2. **El invite pre-crea el usuario.** `InviteRepository.create` hace `upsertUser`
   al invitar (para que el invitado pudiera entrar a la web antes de canjear).
   Comportamiento no deseado: el usuario debe existir recién al hacer redeem.
3. **El tool de invitación pide el nombre** y devuelve un link que el admin tiene
   que reenviar a mano por fuera.

## Decisiones tomadas

- **Redeem: Telegram primero (como hoy).** El mail de invitación lleva el link
  `t.me/<bot>?start=<código>`. El usuario se crea al hacer `/start` en Telegram.
- **Web pre-redeem: rechazado.** El login web solo funciona después de canjear en
  Telegram. Una sola puerta de entrada.
- **Nombre: desde Google, en el primer login web.** El tool de invitación ya no
  pide nombre. Al canjear por Telegram el usuario se crea sin nombre; el bot
  pregunta el nombre como fallback (comportamiento actual) y el primer login web
  lo completa desde el perfil de Google solo si sigue vacío.
- **Envío de mail: Composio** (cuenta gratuita existente, toolkit Gmail), vía SDK
  programático desde el tool — no el Editor/Builder de Mastra.
- **Fix del login: subclase/wrap con callback estricto.** No se emite cookie para
  emails desconocidos.

## Diseño

### 1. Login de Google estricto

En `src/mastra/lib/google-auth.ts`:

- `handleCallback` es una **propiedad de instancia** asignada por
  `attachSSOProvider()` en el constructor de `MastraAuthGoogle`, así que no se
  puede sobreescribir como método de subclase: se envuelve la propiedad después
  de construir la instancia (o en el constructor de una subclase después de
  `super()`).
- Wrap: ejecutar el `handleCallback` original → con el `user` resultante, buscar
  el email en `users`:
  - No existe o `emailVerified === false` → lanzar error. No se emite cookie; el
    login falla en el callback OAuth.
  - Existe → si `user.name` (en Mongo) está vacío y el perfil de Google trae
    nombre, completarlo (`setUserName`). Nunca pisa un nombre ya seteado.
- El `authorizeUser` existente queda intacto como segunda línea de defensa para
  `/api/*`.

### 2. Invitar no crea usuario

- `InviteRepository.create`: eliminar el `upsertUser`. Solo crea el documento de
  invite (código `base64url` de 9 bytes, email normalizado, `expiresAt` a 7 días,
  `createdBy`). El campo `name` desaparece del flujo de creación (el modelo puede
  conservarlo como opcional para invites viejos).
- `create-invite-tool`: input solo `email` (se elimina `name`). Sigue siendo
  solo-admins vía `getUserByResourceId`.
- Caso borde: si el email ya pertenece a un usuario con `telegramId` linkeado,
  el tool responde "ya es usuario" y no crea invite.

### 3. Redeem en Telegram crea el usuario

En `src/mastra/lib/telegram-start.ts` (handler de `/start`):

- Código válido → crear el usuario en ese momento: email del invite, `name: ''`,
  `role: 'member'`, `telegramId`, `addedAt` ahora — en una sola operación
  upsert+link (nuevo método en `UserRepository`, p. ej.
  `upsertFromInviteRedeem(email, telegramId)`), que reemplaza a `linkTelegramId`
  en este flujo. Si el usuario ya existía sin telegram (legacy), solo linkea.
- `buildWelcomeMessage` sigue preguntando "¿cómo te llamás?" cuando no hay nombre.
- El canje sigue siendo atómico (`findOneAndUpdate` sobre invites no usados y no
  vencidos).

### 4. Envío del mail vía Composio

- Nueva dependencia: `@composio/core` (verificar firma exacta contra la doc de
  Composio al implementar; no confiar en memoria).
- Env vars nuevas en `app.config.ts`: `COMPOSIO_API_KEY` y el identificador de la
  cuenta Gmail conectada (según lo que exija el SDK, p. ej. user id / connected
  account id).
- Nueva lib `src/mastra/lib/invite-email.ts`: manda un mail en español al
  invitado con el link `t.me/<bot>?start=<código>`, aclarando que vence en 7 días
  y que el primer paso es Telegram (la web funciona recién después de canjear).
- `create-invite-tool`: crea el invite → manda el mail → responde ok. Si el envío
  falla, el invite igual queda creado y el tool devuelve el link con un aviso
  para que el admin lo reenvíe a mano.

### 5. Manejo de errores

- Login rechazado: el callback OAuth devuelve error, sin cookie de sesión.
- Mail fallido: invite creado + link manual + warning en la respuesta del tool.
- Redemptions concurrentes: una gana, la otra recibe mensaje de invite inválido
  (comportamiento actual).

### 6. Testing

- `invite.repository.test.ts`: ajustar — `create` ya no pre-crea usuario.
- Tests del handler `/start`: el redeem crea el usuario (upsert+link), legacy
  solo linkea.
- Test del wrap de `handleCallback` con deps inyectadas: rechaza email
  desconocido, completa nombre vacío, no pisa nombre existente.
- `invite-email` mockeado en los tests del tool.
- Criterio de cierre: `pnpm test` completo en verde.

## Fuera de alcance

- Roles/permisos más allá de `admin`/`member`.
- Revocación o listado de invitaciones.
- Reenvío automático de mails fallidos.
