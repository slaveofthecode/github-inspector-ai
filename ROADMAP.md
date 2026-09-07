# GitHub Inspector AI — Roadmap

Gestión del proyecto: stack, plan de V1 sólida, visión futura con IA y estrategia de deploy en AWS.

## Stack

- **Frontend & Backend:** Next.js (App Router) — React + API Routes.
- **Styling:** Tailwind CSS + Shadcn UI.
- **Consumo de GitHub:** `fetch` + Zod (versión actual). **Octokit + GraphQL** cuando la capa de IA multiplique las llamadas (punto de quiebre: Fase IA-2).
- **Validación:** Zod (cliente y servidor), un único schema en `lib/validation.ts`.
- **IA (Fases IA-1..4):** Vercel AI SDK + `@ai-sdk/google` (Gemini **free tier**, sin tarjeta) para el LLM; **OSV.dev** (API pública gratuita, sin key) para la detección determinista de vulnerabilidades.
- **Deploy:** AWS **App Runner** (pago por uso) — ver sección [AWS](#aws--deploy-y-releases).

### ¿Por qué `fetch` + Zod ahora, y Octokit + GraphQL después?

El endpoint actual sufre el problema **N+1**: 1 request para los repos + 1 *por cada repo* para los lenguajes (hasta 101 requests con 100 repos). Hoy es inocuo a escala de portfolio, por eso V1 usa `fetch` directo contra la REST API.

Cuando la Fase **IA-2** lea manifests y READMEs repo por repo, las llamadas a GitHub se multiplican y el N+1 deja de ser inocuo. En ese punto se migra a **Octokit + GraphQL**: una sola petición trae repos + lenguajes (y `file` contents cuando haga falta), eliminando latencia, sobre-fetching y *secondary rate limits*.

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

### Fase IA-1 — Esqueleto de streaming *(tag v0.2.0)*
- [ ] Instalar `ai` + `@ai-sdk/google`.
- [ ] `POST /api/analyze`: recibe `{ owner, repo, sha }`, valida con Zod y contra SSRF (solo ramas `github.com` / `raw.githubusercontent.com`).
- [ ] Leer el README del repo vía API pública de GitHub y pasarlo por Gemini en **streaming**.
- [ ] Componente cliente "Analyze" por card + panel de markdown en vivo (palabra por palabra).
- [ ] Manejar repos sin README / privados / 404.

### Fase IA-2 — Detección real de vulnerabilidades *(tag v0.3.0)*
- [ ] Parsers de manifests: `package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Gemfile` (+ lockfiles si aplica).
- [ ] Batch query a **OSV.dev API** (gratis, sin key) con las versiones resueltas → lista determinista de vulnerabilidades por repo.
- [ ] Badges de CVEs (severity + versiones afectadas) en la card / panel de análisis.

### Fase IA-3 — Capa LLM completa *(tag v0.4.0)*
- [ ] Gemini explica cada CVE (impacto real en ese repo), prioriza y sugiere fixes — **siempre** con los datos deterministas de OSV.dev como única fuente de CVEs (los LLM pueden alucinar CVEs).
- [ ] Streaming en 2 fases: primero la lista determinista de CVEs, luego el análisis narrativo.

### Fase IA-4 — Robustez *(tag v0.5.0)*
- [ ] Cache por `owner/repo@sha` (evita re-análisis si el repo no cambió).
- [ ] Rate-limit en `/api/analyze` (protege cuota de GitHub y tokens LLM).
- [ ] Tope de tokens/tamaño en README y límite de repos analizables por usuario.
- [ ] Manejo de errores bonito (timeout de Gemini, cuota agotada, repo gigante).

### Fase IA-5 — Migración Octokit + GraphQL *(tag v0.6.0, solo si el N+1 importa)*
- [ ] Cuando IA-2/IA-3 multipliquen requests a GitHub o haya que leer varios archivos por repo, migrar a Octokit + GraphQL (ver rationale arriba).

## AWS — Deploy y releases

> Decisión: **arrancar el deploy en AWS desde la versión actual (V1, sin AI)** e ir publicando cada fase como un release nuevo. Además de asegurar el sitio, es un skill demostrable para el portfolio.

### Modelo de releases
- Cada fase publicada = un **tag de versión** (`v0.1.0` actual → `v0.2.0` IA-1 → …).
- Un pipeline de **GitHub Actions** detecta el tag → build → **deploy automático**. Poco/nada de downtime y rollback fácil si el health check falla.
- Alternativa simple: App Runner también puede deployar directo desde push a `main`; el modelo por tag da versiones auditables.

### Ahora (V1, sin AI): AWS App Runner
- **Servicio:** App Runner (pago por uso; a tráfico de portfolio ≈ **$0–5/mes**).
- **Fuente:** el repo de GitHub (build automático desde el `Dockerfile`).
- **Necesario:**
  - `Dockerfile` para el server Node de Next.js con `output: 'standalone'`.
  - Env vars en el servicio: `GITHUB_TOKEN` (+ `GEMINI_API_KEY` cuando arranque la IA).
  - Cuenta AWS con tarjeta de crédito (solo por verificación de identidad).
- **Ventajas:** HTTPS y escala resueltos por AWS; sin VPC/ALB que administrar y **sin problema de idle-timeout para streaming** (no hay ALB).

### Futuro (cuando escale): ECS Fargate + ALB
- **Servicio:** Fargate detrás de un ALB + CloudFront (CDN); secretos en Secrets Manager.
- **Costo:** ~$30–40/mes fijo hay o no tráfico (por eso se pospone).
- **Ojo:** subir el **idle timeout del ALB** de 60s → ~300s (o 0) o el streaming de Gemini se corta con un 504 a mitad de la respuesta.
- Mismo pipeline de GitHub Actions: build → ECR → deploy rolling/blue-green por tag.

### Costos y cuentas (resumen para el developer)
- Cuenta AWS: gratis en sí; se paga por uso. La tarjeta es solo verificación de identidad.
- App Runner: pago por vCPU/memoria por segundo; a tráfico bajo ≈ $0–5/mes.
- Fargate + ALB: **siempre** ~$30–40/mes.
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