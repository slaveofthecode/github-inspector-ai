# GitHub Inspector AI — Roadmap

Gestión del proyecto: stack, plan de V1 sólida, visión futura con IA y estrategia de deploy en AWS. test

## Stack

- **Frontend & Backend:** Next.js (App Router) — React + API Routes.
- **Styling:** Tailwind CSS + Shadcn UI.
- **Consumo de GitHub:** `fetch` + Zod (versión actual). **Octokit + GraphQL** cuando la capa de IA multiplique las llamadas (punto de quiebre: Fase IA-2).
- **Validación:** Zod (cliente y servidor), un único schema en `lib/validation.ts`.
- **IA (Fases IA-1..4):** Vercel AI SDK + `@ai-sdk/google` (Gemini **free tier**, sin tarjeta) para el LLM; **OSV.dev** (API pública gratuita, sin key) para la detección determinista de vulnerabilidades.
- **Deploy:** AWS **Amplify Hosting** (Free Tier) conectado a GitHub — ver sección [AWS](#aws--deploy-y-releases).

### ¿Por qué `fetch` + Zod ahora, y Octokit + GraphQL después?

El endpoint actual sufre el problema **N+1**: 1 request para los repos + 1 _por cada repo_ para los lenguajes (hasta 101 requests con 100 repos). Hoy es inocuo a escala de portfolio, por eso V1 usa `fetch` directo contra la REST API.

Cuando la Fase **IA-2** lea manifests y READMEs repo por repo, las llamadas a GitHub se multiplican y el N+1 deja de ser inocuo. En ese punto se migra a **Octokit + GraphQL**: una sola petición trae repos + lenguajes (y `file` contents cuando haga falta), eliminando latencia, sobre-fetching y _secondary rate limits_.

Con token: REST = 5000 requests/hora, GraphQL = 5000 puntos/hora (la query de listado rinde bastante más).

**Tradeoff:** la connection `languages` de GraphQL viene ordenada por tamaño pero sin el byte count exacto de REST. Suficiente para el top 5 de tecnologías.

## Visión

> Un inspector inteligente de repositorios de GitHub: lista repositorios públicos con sus tecnologías y analiza con IA (resúmenes, vulnerabilidades, CVEs) directamente en el navegador, con respuestas en streaming.

## Parte 1 — V1: ESTADO COMPLETADO ✅

### Fase 0 — Base y dependencias

- [x] Instalar `zod`.
- [x] No instalar AI SDK todavía (proveedor se decide después: **Gemini free**).
- [x] Arreglar metadata en `app/layout.tsx`.

### Fase 1 — Validación con Zod

- [x] Crear `lib/validation.ts` (`githubUsernameSchema` + `parseGithubInput`).
- [x] Reutilizarlo en cliente y servidor; eliminar la regex manual de `page.tsx`.

### Fase 2 — API (`fetch` + Zod)

- [x] `app/api/repos/route.ts`: validación server-side con Zod + header `Authorization` condicional + manejo de errores 400/404/429/500.

_Nota: se decidió NO usar Octokit/GraphQL en V1 (ver rationale arriba)._

### Fase 3 — Setup Shadcn UI

- [x] Init con tema oscuro slate + componentes `button`, `input`, `card`, `badge`, `skeleton`.

### Fase 4 — Refactor de `page.tsx`

- [x] Validación Zod en cliente (feedback temprano).
- [x] Componentes Shadcn + estética slate-950/indigo.
- [x] Skeletons de carga, empty state, error alert, infinite scroll, scroll-to-top.

### Fase 5 — Verificación

- [x] `bun run lint` y `bun run build`.
- [x] Test manual (usuario real e inexistente) + fix de 3 bugs detectados: contrato API devolvía `usernameParsed` en vez de `username`, return faltante en `parseGithubInput` para usernames planos, y `handleSearch` no limpiaba resultados previos al validar.

### Fase 6 — Documentación y landing

- [x] `README.md` profesional en inglés.
- [x] `docs/index.html` self-contained (GitHub Pages) + `og-image` (1200×630) + LinkedIn.
- [x] Rama `bug/003-ui-and-front-end` mergeada a `main` (fast-forward, `c6ee21b`). Publicado: https://slaveofthecode.github.io/github-inspector-ai/

## Parte 2 — IA + AWS (plan activo)

Punto de partida: `main` en `c6ee21b` (V1 estable, sin AI). Cada hito publica un **tag de versión** que dispara el deploy automático en AWS.

> **Estado:** IA-1 implementada y publicada en `feat/009` (PR pendiente de merge). El **blindaje de producción** (núcleo de IA-4) se entrega en `v0.2.0` vía `feat/010`, antes de IA-2, para proteger la cuota gratuita de Gemini en el deploy público.

### Fase IA-1 — Esqueleto de streaming _(entregada en `feat/009`)_

- [x] Instalar `ai` + `@ai-sdk/google`.
- [x] `POST /api/analyze`: recibe `{ owner, repo }`, valida con Zod (schema `analyzeBodySchema`) y restringe fetch a `api.github.com` / `raw.githubusercontent.com` (anti-SSRF estructural). _Zod+SSRF completados en `v0.2.0`._
- [x] Leer el README del repo vía API pública de GitHub y pasarlo por Gemini en **streaming**.
- [x] Componente cliente "Analyze" por card + panel de markdown en vivo (palabra por palabra).
- [x] Manejar repos sin README / privados / 404.

### Fase IA-2 — Detección real de vulnerabilidades _(tag v0.3.0)_

- [ ] Parsers de manifests: `package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Gemfile` (+ lockfiles si aplica).
- [ ] Batch query a **OSV.dev API** (gratis, sin key) con las versiones resueltas → lista determinista de vulnerabilidades por repo.
- [ ] Badges de CVEs (severity + versiones afectadas) en la card / panel de análisis.

### Fase IA-3 — Capa LLM completa _(tag v0.4.0)_

- [ ] Gemini explica cada CVE (impacto real en ese repo), prioriza y sugiere fixes — **siempre** con los datos deterministas de OSV.dev como única fuente de CVEs (los LLM pueden alucinar CVEs).
- [ ] Streaming en 2 fases: primero la lista determinista de CVEs, luego el análisis narrativo.

### Fase IA-4 — Robustez _(tag v0.5.0 · núcleo adelantado a `v0.2.0`)_

- [x] Cache por `owner/repo@sha` (evita re-análisis si el repo no cambió). _Entregado en `v0.2.0` (in-memory, TTL 6h, tope 200 entradas)._
- [x] Rate-limit en `/api/analyze` (protege cuota de GitHub y tokens LLM). _Entregado en `v0.2.0` (10/min por IP, in-memory, ventana 60s)._
- [x] Tope de tokens/tamaño en README y límite de repos analizables por usuario. _Tope de README (8k chars) + `maxOutputTokens` (2048) entregados en `v0.2.0`; límite de repos por usuario pendiente._
- [x] Manejo de errores bonito (timeout de Gemini, cuota agotada, repo gigante). _Errores mapeados a status + mensajes amigables (400/403/404/429/507) en `v0.2.0`; timeout estricto de Gemini y repo gigante pendientes._
- [ ] Resto IA-4: persistir cache/rate-limit distribuido (Upstash/Redis) si el tráfico lo exige, límites de repos por usuario, timeout estricto, rate-limit en `GET /api/repos`.

### Fase IA-5 — Migración Octokit + GraphQL _(tag v0.6.0, solo si el N+1 importa)_

- [ ] Cuando IA-2/IA-3 multipliquen requests a GitHub o haya que leer varios archivos por repo, migrar a Octokit + GraphQL (ver rationale arriba).

## AWS — Deploy y releases (Amplify Hosting)

> Decisión: **desplegar en AWS desde la versión actual (V1, sin AI)** e ir publicando cada fase como un release nuevo. Amplify Hosting ofrece CI/CD automático conectado a GitHub dentro del **Free Tier** de AWS, sin Dockerfile ni infraestructura extra que administrar.

### Modelo de releases

- **CI/CD por rama:** Amplify despliega automáticamente cada push a `main` → "publicar una versión" = merge a `main`.
- Cada fase publicada mantiene un **tag de versión** como registro auditorio (`v0.1.0` actual → `v0.2.0` IA-1 → …), pero el deploy no depende de tags: lo dispara el push.
- Rollback simple: Amplify conserva los deployments anteriores y permite volver a uno previo desde la consola.

### Ahora (V1, sin IA): AWS Amplify Hosting

- **Servicio:** Amplify Hosting — **Free Tier** (~1000 min de build/mes, 5 GB de storage, 15 GB de transferencia; SSR de Next.js incluido).
- **Fuente:** el repo de GitHub conectado directamente (rama `main`).
- **Build:** auto-detección del framework **Next.js SSR** → usa el build output por defecto de Next.js (sin `output: 'standalone'`, sin `Dockerfile`, sin `amplify.yml` custom).
- **Env vars:** en la consola de Amplify (por entorno): `GITHUB_TOKEN` (+ `GEMINI_API_KEY` cuando arranque la IA).
- **Ventajas:** CI/CD automático por push, HTTPS y escala resueltos por AWS, previews por PR (full-stack environments) y sin coste fijo a tráfico de portfolio.
- **Necesario:** cuenta AWS (la tarjeta de crédito es solo verificación de identidad).

### Costos y cuentas (resumen para el developer)

- Cuenta AWS: gratis en sí; se paga por uso. La tarjeta es solo verificación de identidad.
- Amplify Hosting: el **Free Tier** cubre build + hosting + SSR a tráfico de portfolio; pasa a pago por uso al superar los límites del tier.
- Gemini free: cuota diaria generosa, sin tarjeta. OSV.dev: gratis sin key. Ver límites de cada proveedor.

## Proveedores de IA (free tier)

- **Gemini (`@ai-sdk/google`)**: cuota diaria gratuita, sin tarjeta. Elegido para el MVP.
- **OSV.dev**: API pública gratuita de CVEs, sin key, ideal para detección determinista.
- Evaluadas y descartadas por ahora: Groq (rate limit más estricto), OpenAI (requiere pago para IA).
- **Caveat:** los free tiers tienen límites de cuota → suficientes para demo/portfolio, no para tráfico alto sin migrar.

## Notas de seguridad

- `GITHUB_TOKEN` y `GEMINI_API_KEY` solo en server-side (env vars del entorno de deploy; Secrets Manager en AWS).
- `GET /api/repos` y `POST /api/analyze` validan input con Zod y contra **SSRF** (solo `github.com` / `raw.githubusercontent.com`).
- Rate-limit en `/api/analyze` para que nadie gaste tu cuota de Gemini/GitHub a tu costo (Fase IA-4).
- Nunca exponer tokens en client components ni dentro del image de Docker.
