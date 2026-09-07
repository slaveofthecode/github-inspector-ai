# PLAN.md — Estabilización V1 (paso a paso)

> Plan para dejar el proyecto **estable, prolijo y escalable**, listo para la versión con IA.
> Lo aplica el desarrollador; cada paso explica **qué**, **dónde** y **por qué**.
> La documentación final (README + GitHub Pages) la genera la IA al terminar los pasos 1–8.

---

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

- **Paso 9 — `README.md`**: reescritura completa en inglés (qué hace, features, stack, quick start, estructura, API, deploy) + enlace a ROADMAP y al GitHub Pages.
- **Paso 10 — `docs/index.html`**: página estática self-contained en inglés para GitHub Pages (hero, about, features, stack, how it works, footer con repo/demo/LinkedIn, `og:` tags listas para compartir en LinkedIn). Activar en GitHub → Settings → Pages → `/docs`.

---

## Nota para la versión futura (IA)

Octokit + GraphQL quedan **descartados para esta V1** (pocas llamadas, API simple). Se usarán cuando la capa de IA multiplique las llamadas a GitHub (README, archivos de dependencias, etc.) y el problema N+1 (hoy: hasta 101 requests por búsqueda: 1 por repos + 1 por cada repo para lenguajes) deje de ser inocuo. GraphQL convertiría esas 101 peticiones en 1.