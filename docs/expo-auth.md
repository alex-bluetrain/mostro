# Auth de Google directo (contrato para clientes tipo Expo)

Mostro acepta un **id_token de Google como Bearer**, verificado contra el JWKS de
Google. Esto habilita clientes que hacen el login de Google por su cuenta (Expo
Android + web con PKCE vía `expo-auth-session`) **sin necesidad de un BFF**.

Convive con el camino actual de mostro-web (JWT HS256 firmado por su BFF): ambos
providers están en el `CompositeAuth`, no se pisan.

## Configuración del backend

Setear una env var:

```
GOOGLE_CLIENT_ID=<oauth-client-id>.apps.googleusercontent.com
```

Sin esto, el provider ni se registra (opt-in, mismo criterio que `STUDIO_API_KEY`).
En este modo **no** hacen falta `GOOGLE_CLIENT_SECRET` ni `GOOGLE_COOKIE_PASSWORD`:
son solo para el modo SSO/cookie (fase 2, no habilitada).

## Contrato del cliente

1. El cliente hace **Auth Code + PKCE** con Google (`expo-auth-session`) y obtiene
   un `id_token`. El `aud` del token debe ser el mismo `GOOGLE_CLIENT_ID` que
   tiene configurado mostro.
2. En cada request a mostro manda el header:

   ```
   Authorization: Bearer <id_token>
   ```

3. Mostro:
   - verifica el token contra el JWKS de Google (firma RS256, `iss`, `aud`, `exp`);
   - aplica el **invite gate**: el email tiene que existir en `users` (acceso por
     invitación, no por dominio — no se usa `GOOGLE_ALLOWED_DOMAINS`);
   - resuelve el rol (`admin` | `member`) desde Mongo por email, igual que hoy.

## Storage del token en el cliente

- **Android**: `id_token` en SecureStore (aislado del JS).
- **Web**: `id_token` en memoria + silent re-login (`prompt=none`), o migrar a la
  fase 2 (cookie httpOnly server-side) si el re-login molesta.

El boilerplate del cliente vive en el repo de Expo cuando exista; mostro solo
necesita el `GOOGLE_CLIENT_ID` y el email invitado en `users`.
