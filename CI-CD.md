# CI/CD

Documentación de los pipelines de GitHub Actions de este repositorio: qué hace cada workflow, por qué está diseñado así, y qué tener en cuenta al tocarlos.

Archivos involucrados:

| Archivo | Rol |
|---|---|
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | Checks de calidad (typecheck, tests, build de Docker sin push) |
| [`.github/workflows/release.yml`](.github/workflows/release.yml) | Versionado con release-please + publicación de imagen a GHCR |
| [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) | Deploy manual a la VM de GCP |
| [`release-please-config.json`](release-please-config.json) / [`.release-please-manifest.json`](.release-please-manifest.json) | Configuración y estado de release-please |
| [`Dockerfile`](Dockerfile) | Imagen que se publica y deploya |

---

## 1. Visión general y arquitectura

### El flujo completo

```
   PR abierto                push a main                     merge del Release PR
       │                          │                                  │
       ▼                          ▼                                  ▼
  ┌─────────┐              ┌─────────────┐                    ┌─────────────────────┐
  │ ci.yml  │              │ release.yml │                    │ release.yml         │
  │ checks  │              │  release-please ──► abre/        │  release-please     │
  │ docker  │              └─────────────┘      actualiza     │   └ crea tag vX.Y.Z │
  └─────────┘                                   Release PR    │  checks (reusa ci)  │
                                                              │   └ publish ──► GHCR│
                                                              └─────────────────────┘
                                                                     │
                                                     (humano decide) ▼
                                                              ┌─────────────┐
                                                              │ deploy.yml  │
                                                              │ (manual)    │──► VM GCP
                                                              └─────────────┘
```

### Decisiones de diseño

**1. Releases con release-please + conventional commits.**
Los commits a `main` siguen [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, etc.). release-please los acumula en un "Release PR" que mantiene abierto y actualizado. Cuando un humano mergea ese PR, se crea el tag `vX.Y.Z`, el GitHub Release y el CHANGELOG. Recién ahí se publica una imagen Docker. Ventaja: el versionado es automático y auditable, pero la decisión de "cortar release" sigue siendo humana.

**2. La imagen se publica solo en releases, no en cada push.**
GHCR solo recibe imágenes correspondientes a tags `vX.Y.Z` (más `latest`). No hay imágenes por commit ni por rama. Esto simplifica el registry y garantiza que todo lo que hay en GHCR es deployable y trazable a un release.

**3. Deploy 100% manual y por tag inmutable.**
`deploy.yml` solo corre por `workflow_dispatch` y exige escribir el tag a mano (sin default, a propósito). Deploy y rollback son la misma operación: correr el workflow con otro tag. Nada se deploya automáticamente al mergear.

**4. CI corre en PRs y al releasear — no en cada push a main.**
`ci.yml` no tiene trigger de `push`: los checks corren en el PR (antes del merge) y `release.yml` los reinvoca vía `workflow_call` solo cuando se crea un release, para gatear el publish. Un push normal a `main` solo corre release-please (segundos). Trade-off asumido: un push directo a `main` sin PR no se testea hasta el próximo release.

**5. Sin secretos de aplicación en el pipeline.**
El deploy solo escribe `IMAGE_TAG` en el `.env` de la VM. Los secretos reales (API keys, connection strings) los resuelve el CLI de Infisical **dentro del contenedor** al arrancar, autenticándose con la identidad de la VM (GCP ID token). El pipeline nunca ve ni transporta secretos de la app.

**6. Autenticación sin credenciales estáticas.**
- GitHub → GCP: Workload Identity Federation (`id-token: write`), no hay JSON keys de service account.
- GitHub → GHCR: el `GITHUB_TOKEN` efímero del propio workflow.
- Contenedor → Infisical: GCP ID token del metadata server de la VM.

No hay ninguna credencial de larga vida que rotar.

---

## 2. Los workflows en detalle

### 2.1 `ci.yml` — CI

**Cuándo corre:** en cada pull request, y cuando `release.yml` lo invoca (`workflow_call`) al crearse un release. Deliberadamente **no** tiene trigger de `push` propio (ver decisión 4).

**Concurrencia:** `cancel-in-progress: true` — si pusheás de nuevo al mismo PR, la corrida anterior se cancela. Correcto para CI: la corrida vieja ya no aporta nada.

**Jobs (corren en paralelo):**

#### `checks` — Typecheck + tests unitarios
1. Levanta MongoDB 7 como service container en `localhost:27017` (los tests lo usan; `tests/setup-env.ts` defaultea `MONGODB_URI` a esa dirección).
2. `pnpm/action-setup@v4` sin versión explícita: lee la versión de pnpm del campo `packageManager` de `package.json` (única fuente de verdad).
3. `pnpm install --frozen-lockfile` — falla si el lockfile está desincronizado.
4. `pnpm typecheck` (`tsc --noEmit`).
5. `vitest run` **excluyendo** `*.integration.test.ts`: esos tests usan un LLM real vía `OPENROUTER_API_KEY` y son flaky/costosos, así que no gatean el pipeline. Ojo: al pasar `--exclude` se pisa el exclude default de vitest, por eso `node_modules` se excluye explícitamente.

#### `docker` — Docker build (sin push)
Valida que el `Dockerfile` buildea, sin publicar nada. Detecta roturas del build (deps de sistema, `mastra build`, etc.) antes del merge.

Sin cache `type=gha` a propósito: exportar el layer del `pnpm install` (~1.2GB) cuesta más tiempo del que ahorra, y el layer de `mastra build` se invalida en cada commit de todas formas.

---

### 2.2 `release.yml` — Release

**Cuándo corre:** en cada push a `main` (incluye el merge del propio Release PR).

**Permisos:** `contents: write` (crear tags/releases), `pull-requests: write` (el Release PR), `packages: write` (pushear a GHCR).

**Concurrencia:** grupo `release` sin `cancel-in-progress`: un release a mitad de camino no se cancela.

**Jobs (encadenados: `release-please` → `checks` → `publish`):**

#### `release-please`
Corre `googleapis/release-please-action@v4` con la config del repo. Dos comportamientos según el push:
- **Push normal:** abre o actualiza el Release PR acumulando los conventional commits. No publica nada, y los demás jobs se skipean — la corrida dura segundos.
- **Merge del Release PR:** crea el tag `vX.Y.Z` + GitHub Release + CHANGELOG, y expone `release_created=true` y `tag_name` como outputs.

⚠️ Requiere el switch del repo **"Allow GitHub Actions to create and approve pull requests"** (Settings → Actions → General). Los `permissions` del workflow solos no alcanzan.

La config (`release-please-config.json`) es mínima: un solo paquete (`.`), `release-type: node` (versiona `package.json`), tags sin componente (`v1.2.0`, no `mostro-v1.2.0`). El manifest (`.release-please-manifest.json`) guarda la última versión releaseada.

#### `checks`
Reusa `ci.yml` completo vía `uses: ./.github/workflows/ci.yml`. Solo corre si `release_created == 'true'`: valida el estado real de `main` justo antes de publicar. Gatea el publish: nada llega a GHCR con typecheck o tests en rojo.

#### `publish`
Solo corre si `release_created == 'true'` **y** `checks` pasó. Buildea la imagen y la pushea a GHCR con dos tags:
- `vX.Y.Z` — **inmutable**, es a lo que se le hace deploy y rollback.
- `latest` — existe solo para el `docker compose pull` del startup script de la VM en el primer boot.

El login a GHCR usa el `GITHUB_TOKEN` del propio workflow: cero credenciales que administrar.

Al final escribe en el step summary el nombre de la imagen y la instrucción para deployarla.

---

### 2.3 `deploy.yml` — Deploy

**Cuándo corre:** solo manual (`workflow_dispatch`) con un input obligatorio `version` (ej: `v1.2.0`). **Sin default a propósito:** el rollback depende de tags inmutables, y un default a `latest` haría que "abrir el form y dar enter" tome un camino no reproducible.

**Permisos:** `id-token: write` (WIF hacia GCP), `packages: read` (consultar el manifest en GHCR).

**Concurrencia:** grupo `deploy-prod`, `cancel-in-progress: false`. Un deploy a la vez, y cancelar uno a mitad de camino dejaría la VM en estado indeterminado — se encolan, no se cancelan.

**Pasos:**

1. **Auth a GCP** vía Workload Identity Federation (`google-github-actions/auth@v2`) — sin keys estáticas.
2. **Verificar que el tag existe en GHCR** con `docker manifest inspect` (consulta el registry sin bajar la imagen). Filosofía *fail-fast*: si el tag no existe, el workflow falla acá y la VM ni se toca.
3. **Actualizar la VM** por SSH con túnel IAP (la VM no necesita IP pública ni puerto 22 abierto):
   - Escribe `IMAGE_TAG=vX.Y.Z` en el `.env` del directorio de deploy (lo único que viaja — ver decisión 5).
   - `docker compose pull && docker compose up -d --remove-orphans`.
4. **Health gate:** pollea `docker inspect .State.Health.Status` del contenedor `mostro-app-1` cada 15s, hasta 20 intentos (~5 min). Si no llega a `healthy`, el workflow falla en rojo — un deploy roto nunca queda en verde.

**Rollback:** correr este mismo workflow con el tag anterior. No hay mecanismo aparte.

---

## 3. Sugerencias, mejoras y peligros

### Peligros / cosas a tener en cuenta

- **El health-check no revierte.** Si la app no llega a `healthy`, el workflow queda en rojo pero la VM queda corriendo la versión rota (o el contenedor ciclando). El rollback es manual: correr Deploy con el tag anterior. Aceptable para este proyecto, pero hay que saberlo.
- **Ventana de inconsistencia si falla el publish.** El tag `vX.Y.Z` y el GitHub Release se crean en el job `release-please`, pero la imagen se pushea en `publish`. Si `checks` o `publish` fallan, existe un release **sin imagen**. El chequeo de `deploy.yml` te protege (falla rápido), pero el fix es re-correr el workflow fallido desde la UI de Actions, y eso no es obvio para alguien nuevo.
- **`checks` gatea el publish, no el tag.** El tag ya existe cuando `checks` corre (es `needs: release-please`). Consecuencia: puede haber tags/releases cuya imagen nunca existió. Mismo remedio que el punto anterior.
- **Pushes directos a `main` no se testean.** Los checks corren en PRs y al releasear — un commit pusheado directo a `main` no pasa por CI hasta el próximo release. Trabajar por PRs; si querés forzarlo, activá branch protection con required status checks.
- **Roturas en `main` se detectan tarde.** Dos PRs verdes por separado pueden romperse al combinarse (semantic conflict), y eso recién sale a la luz en el `checks` del release. No es grave — el release falla y lo arreglás — pero el diagnóstico llega días después del merge que lo causó.
- **Los integration tests no corren nunca en CI.** `*.integration.test.ts` (LLM real) está excluido. Nada en el pipeline los ejecuta, ni siquiera nightly — si se rompen, te enterás en local o en prod.
- **`latest` es mutable.** Solo lo usa el startup script del primer boot, pero si alguien lo usa para deployar "a mano" en la VM, pierde reproducibilidad. No usar `latest` para nada más.
- **Single VM, downtime en cada deploy.** `docker compose up -d` recrea el contenedor: hay unos segundos de corte. Sin réplicas ni blue-green. Asumido para un bot familiar; no escalar este esquema a algo con SLA sin repensarlo.
- **Secrets de infra en GitHub Secrets** (`GCP_WIF_PROVIDER`, `GCP_CI_SERVICE_ACCOUNT`, `GCP_VM_NAME`, `GCP_ZONE`). No son credenciales, pero si cambian (recrear la VM, cambiar de proyecto GCP) los workflows fallan de formas poco obvias. Documentar su origen en el runbook de infra.

### Mejoras posibles (por orden de valor/esfuerzo)

1. **Branch protection en `main`** (require PR + required status checks). Cierra el agujero de los pushes directos sin testear, sin agregar corridas de CI.
2. **Job nightly (schedule) para los integration tests**, con `continue-on-error` o en workflow aparte que no gatee nada. Hoy son código muerto desde la perspectiva del pipeline.
3. **Environment de GitHub (`production`) en el job de deploy.** Gratis incluso en repos privados personales: historial de deploys en la UI, y opcionalmente *required reviewers* como aprobación extra.
4. **Notificación post-deploy** (Telegram, dado que el proyecto ya es un bot de Telegram): éxito/fallo del deploy con el tag. Cierra el loop sin abrir GitHub.
5. **`docker/metadata-action` para los tags de imagen** si en algún momento se quieren tags adicionales (sha, major/minor). Hoy con dos tags fijos no hace falta — KISS.
6. **Digest pinning de las actions de terceros** (`actions/checkout@<sha>` en vez de `@v4`) si el repo se vuelve más sensible. Hoy el riesgo es bajo y el costo de mantenimiento existe; evaluar con Dependabot/Renovate.

### Qué NO cambiar (decisiones deliberadas)

- **No agregar trigger `push` a `ci.yml`** — duplica corridas (ver comentario en el archivo).
- **No agregar default al input `version` de deploy** — rompe la garantía de reproducibilidad.
- **No activar `cancel-in-progress` en deploy/release** — cortar a mitad deja estado inconsistente.
- **No agregar cache `type=gha` al build de Docker** — ya se midió: cuesta más de lo que ahorra.
