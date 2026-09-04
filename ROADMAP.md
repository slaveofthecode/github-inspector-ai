# GitHub Inspector AI — Roadmap

Gestión del proyecto: stack, plan de V1 sólida y visión futura con IA.

## Stack

- **Frontend & Backend:** Next.js (App Router) — React + API Routes.
- **Styling:** Tailwind CSS + Shadcn UI.
- **Consumo de GitHub:** Octokit SDK (**GraphQL** para el listado).
- **Validación:** Zod (cliente y servidor).

### ¿Por qué GraphQL para listar repos?

El endpoint actual sufre el problema **N+1**: 1 request para los repos + 1 request *por cada repo* para los lenguajes (hasta 101 requests con 100 repos).

En GraphQL una sola petición devuelve todo (repos + lenguajes), eliminando latencia, sobre-fetching y el riesgo de *secondary rate limits*. Con token: REST = 5000 requests/hora, GraphQL = 5000 puntos/hora (esta query rinde mucho más).

**Tradeoff:** la connection `languages` viene ordenada por tamaño pero no incluye el byte count exacto como REST. Suficiente para el top 5 de tecnologías.

## Visión

> Un inspector inteligente de repositorios de GitHub: lista repositorios públicos con sus tecnologías y, a futuro, análisis con IA (resúmenes, vulnerabilidades, CVEs).

## Fases de desarrollo

### Fase 0 — Base y dependencias
- [ ] Instalar `zod` y `octokit` (SDK oficial REST + GraphQL).
- [ ] No instalar AI SDK todavía (proveedor se decide luego).
- [ ] Arreglar metadata en `app/layout.tsx` ("Create Next App" → "GitHub Inspector").

### Fase 1 — Validación con Zod
- [ ] Crear `lib/validation.ts`:
  - Schema `githubUsernameSchema` (regex oficial de usernames de GitHub).
  - Helper `parseGithubInput(input)` → acepta URL `https://github.com/X` o username plano; retorna `username | null`.
- [ ] Reutilizarlo en cliente (`page.tsx`) y servidor (`route.ts`). Eliminar la regex manual de `page.tsx`.

### Fase 2 — API con Octokit + GraphQL
- [ ] Reescribir `app/api/repos/route.ts`:
  - Client `new Octokit({ auth: GITHUB_TOKEN })`.
  - **Una sola query GraphQL**: `user(login) → repositories(first:100) → nodes{ id, name, description, createdAt, pushedAt, languages(first:5){nodes{name}} }`.
  - Ordenar por `createdAt` desc (mismo contrato de respuesta actual: `id, name, description, createdAt, pushedAt, languages`).
  - Manejo de errores robusto:
    - Usuario no existe → 404 "GitHub user not found".
    - Rate limit → mensaje amigable "límite superado, espera un momento".
    - Fallos de red/otros → 500 genérico.

### Fase 3 — Setup Shadcn UI
- [ ] `npx shadcn@latest init` (tema oscuro, base slate).
- [ ] Añadir componentes: `button`, `input`, `card`, `badge`, `alert`, `skeleton`, `separator`.
- [ ] Mantener estética slate-950/indigo existente.

### Fase 4 — Refactor de `page.tsx`
- [ ] Validación Zod en cliente con mensajes de error claros.
- [ ] Reemplazar JSX manual por componentes Shadcn.
- [ ] Mejoras de UX:
  - Skeleton loading (cards fantasma).
  - Empty state ("Este usuario no tiene repositorios").
  - Error alert estilizado.
  - Mantener infinite scroll + botón scroll-to-top.

### Fase 5 — Verificación
- [ ] `bun run lint` y `bun run build`.
- [ ] Test manual con un usuario real (ej. `vercel`) y con uno inexistente.

## Próximos pasos con IA (futuro)

- [ ] **Resumen inteligente de repositorios:** pasar el README.md o la estructura de archivos a un LLM para generar un resumen técnico preciso.
- [ ] **Análisis preliminar de vulnerabilidades (SAST básico):** inspeccionar archivos de dependencias (`package.json`, `requirements.txt`, `Cargo.toml`) para detectar versiones obsoletas o vulnerables.
- [ ] **Explicación de CVEs:** traducir vulnerabilidades complejas (Dependabot/Greenwind) a explicaciones sencillas y sugerir parches.
- [ ] **Streaming UI:** respuestas en tiempo real del análisis de IA palabra por palabra (capacidad nativa de Next.js).
- [ ] Proveedor de LLM por decidir (Vercel AI SDK).

## Notas de seguridad

- `GITHUB_TOKEN` solo se usa server-side; nunca exponerlo en client components.
- `.env.local` está cubierto por `.gitignore` y no fue commiteado. Recomendado rotar el token si se ha compartido.