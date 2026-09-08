# PLAN.md — Estabilización V1 + Deploy AWS + Fases IA

> **Parte 1 (pasos 1–8 + docs): COMPLETADA ✅** — proyecto estable, prolijo y escalable.
> **Parte 2 (al final del archivo): plan activo** — deploy en AWS (Amplify Hosting) + fases de IA (IA-1..4).
> Lo aplica el desarrollador; cada paso explica **qué**, **dónde** y **por qué**.

---

# Parte 1 — Estabilización V1 (completada)

## Paso 1 — Instalar Zod

**Comando (raíz del proyecto):**

```bash
bun add zod
```

**¿Dónde aplica?** `package.json` (dependencias) + `bun.lock`.

**¿Por qué?**
- TypeScript solo valida en *compile-time*; los datos de un formulario llegan en runtime como strings sin garantías.
- Zod valida en runtime y permite definir el schema **una sola vez**, reutilizable en cliente y servidor (single source of truth).
- No usamos Octokit ni GraphQL en esta versión (pocas llamadas a una API simple). Se dejarán anotados para la versión con IA (ver Roadmap).

---

## Paso 2 — Crear `lib/validation.ts`

**Archivo nuevo:** `lib/validation.ts`

```ts
import { z } from "zod";

const githubUsernameSchema = z
  .string()
  .trim()
  .min(1, "Please enter a GitHub URL or username.")
  .regex(
    /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i,
    "That doesn't look like a valid GitHub username."
  );

export function parseGithubInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      if (!url.hostname.toLowerCase().endsWith("github.com")) return null;
      const [owner] = url.pathname.split("/").filter(Boolean);
      return owner && githubUsernameSchema.safeParse(owner).success ? owner : null;
    }
  } catch {
    return null;
  }

  return githubUsernameSchema.safeParse(trimmed).success ? trimmed : null;
}
```

**¿Por qué?**
- Reglas oficiales de username de GitHub: alfanumérico + guiones, sin guiones consecutivos ni al inicio/fin, 1–39 chars.
- `.trim()` + `.safeParse()` maneja espacios y mayúsculas/minúsculas sin lógica extra.
- `parseGithubInput` acepta **URL de GitHub** o **username plano** y devuelve el username normalizado (o `null` si no es válido).
- Reemplazará la regex manual hoy duplicada en `app/page.tsx`.

---

## Paso 3 — Validación en servidor + token condicional

**Archivo:** `app/api/repos/route.ts`

### 3a. Validar el username antes de usarlo

Añadir al inicio:

```ts
import { githubUsernameSchema } from "@/lib/validation";
```

Reemplazar este bloque (líneas ~16-24):

```ts
const rawUsername = request.nextUrl.searchParams.get("username");
if (!rawUsername) {
  return NextResponse.json({ error: "Username is required" }, { status: 400 });
}

const parsed = githubUsernameSchema.safeParse(rawUsername);
if (!parsed.success) {
  return NextResponse.json({ error: "Invalid GitHub username" }, { status: 400 });
}
const username = parsed.data;
```

**¿Por qué?**
- El servidor debe validar **siempre**, nunca confiar en el cliente ("confía en el cliente, verifica en el servidor").
- Hoy un input con `/`, `?`, `..`, etc. se interpola crudo en la URL del fetch → altera la ruta (path injection) y termina en un 500 genérico. Con esto responde un 400 claro.

### 3b. Header de autorización solo si existe token

Reemplazar (líneas ~28-30):

```ts
const headers = new Headers();
if (process.env.GITHUB_TOKEN) {
  headers.set("Authorization", `Bearer ${process.env.GITHUB_TOKEN}`);
}
```

**¿Por qué?**
- Hoy, sin `GITHUB_TOKEN`, se envía `Bearer undefined` → GitHub responde `401`, aunque **anónimo (60 req/h) funcionaría**.
- Con esto la app funciona en cualquier entorno (clones, CI, dev sin `.env`), no solo donde está el token.

---

## Paso 4 — Metadata real + Open Graph

**Archivo:** `app/layout.tsx`

Reemplazar el bloque `metadata` (líneas ~18-21) por:

```tsx
export const metadata: Metadata = {
  title: "GitHub Inspector",
  description:
    "Inspect any GitHub user's public repositories, top languages, and metadata in a clean, fast interface.",
  openGraph: {
    title: "GitHub Inspector",
    description:
      "Inspect any GitHub user's public repositories, top languages, and metadata in a clean, fast interface.",
    type: "website",
    locale: "en_US",
    url: "https://github.com/slaveofthecode/github-inspector-ai",
  },
};
```

**¿Por qué?**
- Hoy dice "Create Next App" (template default) → se ve en la pestaña del navegador y en crawlers.
- Las tags `og:` controlan la previsualización (card) al compartir el link en LinkedIn.

---

## Paso 5 — Limpiar fuentes (solo dejar lo que se usa HOY)

**Archivo:** `app/layout.tsx`

- Import: `import { Geist_Mono, Inter } from 'next/font/google';` (quitar `Geist`).
- Eliminar el bloque `geistSans` (líneas ~8-11).
- Quitar `geistSans.variable` del `className` del `<html>`.

Resultado del bloque relevante:

```tsx
import type { Metadata } from 'next';
import { Geist_Mono, Inter } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });
```

**¿Por qué?**
- `globals.css` solo mapea: `--font-sans` → Inter (texto) y `--font-mono` → Geist_Mono (chip "Created/Updated").
- `Geist` (sans de Vercel) **no la referencia ningún estilo**: configuración muerta que engaña e infla el CSS.
- Cuando se necesite otra fuente se añade entonces; hoy solo está lo que se usa.

---

## Paso 6 — Usar el helper compartido en el cliente

**Archivo:** `app/page.tsx`

1. Borrar el helper `extractUsername` (líneas ~37-56) **y** su regex.
2. Añadir import: `import { parseGithubInput } from "@/lib/validation";`
3. Cambiar:
   ```ts
   const username = extractUsername(inputUrl);
   ```
   por:
   ```ts
   const username = parseGithubInput(inputUrl);
   ```

**¿Por qué?**
- Elimina la lógica duplicada: el mismo schema valida en cliente (feedback rápido) y servidor (seguridad).
- El flujo de error actual se mantiene intacto.

---

## Paso 7 — Skeleton de carga

**Archivo:** `app/page.tsx` + componente nuevo de Shadcn

1. Comando:
   ```bash
   npx shadcn@latest add skeleton
   ```
2. Importar y crear componente interno:
   ```tsx
   import { Skeleton } from '@/components/ui/skeleton';

   function RepoSkeleton() {
     return (
       <Card className="space-y-3 p-6">
         <div className="flex items-center justify-between gap-2">
           <Skeleton className="h-6 w-1/3" />
           <Skeleton className="h-4 w-40" />
         </div>
         <Skeleton className="h-4 w-full" />
         <div className="flex gap-2 pt-2">
           <Skeleton className="h-5 w-16 rounded-full" />
           <Skeleton className="h-5 w-20 rounded-full" />
           <Skeleton className="h-5 w-14 rounded-full" />
         </div>
       </Card>
     );
   }
   ```
3. Render condicional de la lista:
   ```tsx
   {loading ? (
     <div className="space-y-4">
       {Array.from({ length: 5 }).map((_, i) => (
         <RepoSkeleton key={i} />
       ))}
     </div>
   ) : (
     visibleRepos.map((repo) => ( /* ...cards actuales... */ ))
   )}
   ```

**¿Por qué?**
- Hoy, mientras el fetch tarda (1–3 s), la lista queda en blanco → se siente rota/lenta.
- El esqueleto comunica "esto está cargando" y, al reservar la misma altura que las cards reales, evita el salto de layout cuando llegan los resultados.

---

## Paso 8 — Higiene de repo

**Archivos:** `package.json`, `.env.example` (nuevo)

1. Mover `"shadcn": "^4.21.0"` de `dependencies` a `devDependencies` y ejecutar `bun install` (refresca `bun.lock`).
   - **¿Por qué?** El CLI de shadcn solo se usa para generar componentes en desarrollo; no pertenece al runtime de producción.
2. Crear `.env.example`:
   ```
   # GitHub Personal Access Token (optional but recommended).
   # Raises the API rate limit from 60 to 5,000 requests/hour.
   # Create one at https://github.com/settings/tokens
   GITHUB_TOKEN=
   ```
   - **¿Por qué?** Documenta qué configuración necesita el proyecto sin exponer secretos. Quien clone el repo sabe qué poner en `.env.local`.

---

## Verificación final (después del paso 8)

```bash
bun run lint
bun run build
```

Prueba manual:
- Buscar un usuario real (ej. `vercel`).
- Buscar un usuario inexistente (debe mostrar el error correcto).
- Buscar un input inválido (ej. texto con espacios/characters raros) → debe rechazarse sin tocar la API.

---

## Después de esta planificación (lo hace la IA)

Cuando el desarrollador confirme que los pasos 1–8 están aplicados y verificados:

- **Paso 9 — `README.md`** ✅: reescritura completa en inglés (qué hace, features, stack, quick start, estructura, API, deploy) + enlace a ROADMAP y al GitHub Pages.
- **Paso 10 — `docs/index.html`** ✅: página estática self-contained en inglés para GitHub Pages (hero, about, features, stack, how it works, footer con repo/demo/LinkedIn, `og:` tags listas para compartir en LinkedIn). Activar en GitHub → Settings → Pages → `/docs`.

✅ Parte 1 verificada: `bun run lint` + `bun run build` OK, bugs encontrados en la prueba manual corregidos (contrato `username`, return en `parseGithubInput`, limpieza de resultados) y publicados (merge fast-forward de `bug/003-ui-and-front-end` a `main`, tip `c6ee21b`; GitHub Pages live).

---

## Nota para la migración a Octokit + GraphQL (futura — ROADMAP Fase IA-5)

Octokit + GraphQL quedaron **descartados para la V1** (pocas llamadas, API simple). Se usarán cuando la capa de IA (Fases IA-2/IA-3) multiplique las llamadas a GitHub (README, archivos de dependencias, etc.) y el problema N+1 (hoy: hasta 101 requests por búsqueda: 1 por repos + 1 por cada repo para lenguajes) deje de ser inocuo. GraphQL convertiría esas 101 peticiones en 1.

---

# Parte 2 — Deploy AWS + Fases IA (plan activo)

> Punto de partida: V1 estable en `main`. **Amplify Hosting** despliega automáticamente cada push a `main` (CI/CD por rama, ver ROADMAP → AWS); los tags de versión quedan como registro auditorio.
>
> **Nota de flujo:** mientras estamos en una fase pueden aparecer bugs o features nuevas. Reglas:
> 1. Si un bug **bloquea** la fase actual → pausar, arreglarlo y anotarlo aquí como "Bug resuelto (tag)".
> 2. Si aparece una **feature nueva** → decidir: si es chica entra en la fase en curso; si no, se anota en ROADMAP como hito futuro.
> 3. **Nunca** mezclar fixes/features ajenos al alcance de la fase en curso: mantiene cada tag/release limpio y auditable.

## Paso AWS-1 — Conectar el repo en Amplify Hosting

**Herramientas:** consola de AWS (primer deploy, una sola vez por cuenta).

1. Crear cuenta AWS (la tarjeta de crédito es solo verificación de identidad).
2. Ir a **Amplify** → *Create app* → source: **GitHub** → conectar el repo `github-inspector-ai`.
3. Seleccionar la rama `main` como rama de producción (opcional: conectar otras ramas para previews por PR / full-stack environments).
4. Dejar que Amplify **auto-detecte el framework** → *Next.js — SSR*. No hace falta `amplify.yml` ni `Dockerfile`: los scripts de `package.json` ya son compatibles con `npm`.
5. Guardar y esperar el primer build → URL `https://<appid>.amplifyapp.com`. Probar la búsqueda de un usuario real.

> **Ojo:** NO añadir `output: 'standalone'` a `next.config.ts` ni crear un `Dockerfile`: Amplify gestiona el SSR de Next.js con el build output por defecto.

**¿Por qué?**
- Amplify da HTTPS, escala y CI/CD resueltos dentro del **Free Tier** (~1000 min de build/mes, 5 GB de storage, 15 GB de transferencia).
- A tráfico de portfolio el costo es ~$0/mes; pasa a pago por uso solo al superar los límites del tier.

## Paso AWS-2 — Env vars por entorno

**Herramientas:** consola de Amplify → *Hosting* → *Environment variables*.

1. Añadir `GITHUB_TOKEN` (tu PAT actual) al entorno de producción.
2. Cuando arranque la IA (IA-1), añadir `GEMINI_API_KEY` al mismo lugar.
3. Guardar → Amplify re-despliega automáticamente con las variables nuevas.

**¿Por qué?**
- Los tokens viven solo en el entorno de Amplify (nunca en el repo ni en el bundle del cliente).
- Los deploys automáticos regeneran la app con las env vars actualizadas al hacer merge a `main`.

## Paso AWS-3 — CI/CD: deploy por push + dominio

**Configuración:** consola de Amplify → *Hosting* → *Domain management*.

- **CI/CD por rama:** Amplify re-builda y publica cada push/merge a `main`. Para *previews* por PR, conectar ramas extra o usar full-stack environments.
- **Dominio:** el subdominio `https://<appid>.amplifyapp.com` es HTTPS por defecto. Para un dominio propio, conectar en *Domain management* (SSL automático con ACM).
- **Rollback:** *Deployments* → cada deploy queda listado; se puede re-desplegar una versión anterior en 1 clic.

**¿Por qué?**
- "Publicar una versión" = merge a `main`: cero pipelines que mantener.
- Los tags de versión (`v0.2.0`, …) siguen creándose como registro auditorio, pero el deploy no depende de ellos.

## Paso IA-1 — Esqueleto de streaming *(tag v0.2.0)*

**Instalar:**

```bash
bun add ai @ai-sdk/google
```

**Archivos:**
- `lib/ai.ts` (nuevo): helper `getGeminiModel()` que instancia el modelo (`google("gemini-2.0-flash")`) leyendo `process.env.GEMINI_API_KEY`; lanza error claro si falta la key.
- `app/api/analyze/route.ts` (nuevo): `POST` con body `{ owner, repo, sha }`:
  - Schema Zod para el body (strings no vacías, longitud acotada).
  - **Anti-SSRF**: los fetches solo van a `api.github.com` y `raw.githubusercontent.com`, nunca a URLs arbitrarias del usuario.
  - Leer el `README.md` del repo y pasarlo a Gemini con `streamText` → stream de markdown al cliente.
  - Manejar 404 (repo/README no existe), 403 (privado), 429 (rate limit).
- `components/repo-analysis.tsx` (nuevo): botón **Analyze** por card que llama al endpoint y renderiza el markdown del stream en vivo (ReactMarkdown + `readDataStream` / helper del AI SDK).

**¿Por qué?**
- El Vercel AI SDK da **streaming out-of-the-box** y abstrae el provider (cambiar Gemini por otro mañana no toca la UI).
- IA-1 arranca resumiendo el README; la detección real de CVEs llega en IA-2. Iteración chica y verificable.

## Paso IA-2 — Detección real de vulnerabilidades *(tag v0.3.0)*

**Archivos nuevos:**
- `lib/manifests.ts`: dado un path + contenido, extraer nombre y versiones de la dependencia. Soportar `package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Gemfile`.
- `lib/osv.ts`: `queryOSV(deps)` → `POST https://api.osv.dev/v1/querybatch` con todas las dependencias y normalizar el resultado (pkg, ver afectadas, severity, CVEs).
- `app/api/analyze/route.ts` (editar): listar archivos del repo → bajar los manifests conocidos → parsearlos → `queryOSV` **antes** de llamar al LLM.

**¿Por qué?**
- OSV.dev es **determinista y gratis** (sin key): los CVEs NUNCA deben venir del LLM (alucina). La IA solo explica/prioriza sobre datos reales.
- `querybatch` = una sola request para todos los manifests del repo.

## Paso IA-3 — Capa LLM completa *(tag v0.4.0)*

**Archivos:**
- `lib/ai.ts` (editar): prompt estructurado — recibe el listado real de OSV.dev + contexto del repo → explica impacto real, prioridad y fix sugerido para cada uno.
- `components/repo-analysis.tsx` (editar): render en 2 fases — lista determinista de CVEs (badges con severity) + análisis narrativo en streaming.

**¿Por qué?**
- La IA agrega valor **explicando y priorizando**, no inventando vulnerabilidades.
- El modelo recibe únicamente datos de OSV.dev como fuente de CVEs (prompt hardening).

## Paso IA-4 — Robustez *(tag v0.5.0)*

**Archivos nuevos / edits:**
- `lib/cache.ts` (nuevo): cache en memoria (o Upstash Redis) con key `owner/repo@sha`; si el repo no cambió, devolver análisis cacheado (TTL).
- `/api/analyze`: rate-limit por IP (ej. 5/min) + tope de manifests/tamaño + límite de repos por usuario.
- Manejo de errores en UI: cuota de Gemini agotada, timeout, repo privado, README gigante.

**¿Por qué?**
- Protege la cuota gratuita de Gemini y el rate limit de GitHub: alguien podría quemar tus tokens a tu costo sin esto.
- El cache hace re-analizar tu propia carpeta de repos varias órdenes de magnitud más barato.

## Verificación por fase

Cada fase termina con:

```bash
bun run lint
bun run build
```

+ deploy automático de Amplify al mergear a `main` y prueba en `https://<appid>.amplifyapp.com` antes de seguir a la siguiente.