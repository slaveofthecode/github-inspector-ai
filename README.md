# GitHub Inspector

Inspect any GitHub user's public repositories, top technologies, and metadata from a single, clean interface. Paste a GitHub URL or username, and get an instant, readable overview of their repos — sorted by creation date, with their top programming languages.

| | |
|---|---|
| **Site** | https://main.d22y0lq8a3u6xm.amplifyapp.com |
| **Status** | Active development — repo insights, dependency vulnerability scan, and AI vulnerability explanations live |

## Features

- **Search by URL or username** — paste `https://github.com/user` or just `user`; the app extracts and validates the account for you.
- **All public repositories, no caps** — the server-side route queries GitHub's GraphQL API with cursor pagination, so accounts with 100+ repos are fully listed; repos and their top languages arrive in a single query (no per-repo round-trip).
- **Sort by Created Date or Last Commit** — toggle the ordering right from the sticky results header.
- **Top languages per repository with brand icons** — the 5 most-used technologies of every repo, based on byte usage, pulled directly from a single GitHub GraphQL query, rendered with brand icons.
- **Key metadata at a glance** — creation date and last-commit date on every card.
- **AI repository summaries** — click "Analyze Repository with AI" on any card to stream a structured markdown overview (purpose, key features, tech stack, code-health, and suggested improvements) generated live by Gemini from the repo's README.
- **Deterministic vulnerability scan** — during analysis the app reads the repo's dependency manifests (`package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Gemfile`) and checks them against OSV.dev, showing severity-ranked CVEs/GSHAs with their affected versions and aliases. No AI is involved in finding vulnerabilities, so results are factual.
- **AI vulnerability explanations** — Gemini explains and prioritizes each deterministic finding in plain language (what the flaw is, why it matters for that repo, and the fix), while OSV.dev stays the only source of CVEs — the AI never invents a vulnerability.
- **Direct links** — each repository opens on GitHub in a new tab; the `@username` in the results header links to the user's GitHub profile.
- **Infinite scroll** — results load progressively as you scroll; no pagination clicks.
- **Smart loading states** — skeleton cards while fetching, clear empty and error states.
- **Dark, modern UI** — built with Tailwind CSS, shadcn/ui, and lucide-react icons.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router) |
| UI | React 19 + [Tailwind CSS 4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) |
| Icons | [simple-icons](https://simpleicons.org) (language badges) + [lucide-react](https://lucide.dev) (UI) |
| Language | TypeScript |
| Validation | [Zod](https://zod.dev) (client and server) |
| Testing | [Vitest](https://vitest.dev) (unit + component + route-handler tests) + [Playwright](https://playwright.dev) (E2E) |
| AI | [Vercel AI SDK](https://ai-sdk.dev) + Google [Gemini](https://ai.google.dev) (`@ai-sdk/google`) |
| Vulnerability data | [OSV.dev](https://osv.dev) (deterministic, free, no key) via `lib/manifests.ts` + `lib/osv.ts` |
| Package manager | [Bun](https://bun.sh) |
| Backend | Next.js Route Handlers (`/api/repos`, `/api/analyze`, `/api/health`) |

## Quick Start

**Prerequisites:** [Bun](https://bun.sh) installed.

```bash
# 1. Clone the repository
git clone https://github.com/slaveofthecode/github-inspector-ai.git
cd github-inspector-ai

# 2. Install dependencies
bun install

# 3. Configure environment variables (optional)
cp .env.example .env.local

# 4. Start the development server
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

### GitHub token (required for the repo listing)

The repo listing queries GitHub's **GraphQL** API, which requires authentication, so `GITHUB_TOKEN` is **required** for `GET /api/repos` to work. Without it the endpoint returns a clear `503 "not configured"` error instead of listing repos. Add a [Personal Access Token](https://github.com/settings/tokens) to `.env.local` (fine-grained, read-only, "Public repositories" permission is enough):

```
GITHUB_TOKEN=github_pat_xxxxxxx
```

### Gemini API key (optional for features, required for AI analysis)

AI repository summaries need a free Gemini API key. Set it in `.env.local` (or configure it only in your deploy environment):

```
GEMINI_API_KEY=AIzaSyxxxxxxx
GEMINI_MODEL=gemini-3.6-flash   # optional; defaults to gemini-3.6-flash in lib/ai.ts
```

Without it, the app still shows the full repo listing; only the "Analyze with AI" button returns a `503 "not configured"` error.

## Scripts

| Command | Description |
|---|---|
| `bun dev` | Start the development server |
| `bun build` | Build the production bundle |
| `bun start` | Start the production server |
| `bun lint` | Run ESLint |
| `bun test` | Run the test suite once (Vitest) |
| `bun test:watch` | Run tests in watch mode (Vitest) |
| `bun test:e2e` | Run end-to-end browser tests (Playwright) |
| `bun test:ui` | Run E2E tests in Playwright UI mode (interactive, visible browser) |

## Project Structure

```
github-inspector-ai/
├── app/
│   ├── api/analyze/route.ts # POST: streamed AI summary from README (cached + rate-limited)
│   ├── api/repos/route.ts   # GET: queries GitHub GraphQL (cursor pagination, repos + top 5 languages in one query; requires GITHUB_TOKEN)
│   ├── api/health/route.ts  # GET: reports which env vars are configured
│   ├── layout.tsx           # Root layout, fonts, metadata
│   └── page.tsx             # Home page UI + search logic
├── components/
│   ├── language-badge.tsx   # Language labels with brand icons
│   ├── repo-analysis.tsx    # "Analyze with AI" button + streaming markdown panel
│   └── ui/                  # shadcn/ui components (button, card, badge, ...)
├── lib/
│   ├── ai.ts                # Gemini model instance + token/length caps
│   ├── cache.ts             # In-memory TTL cache for analysis results
│   ├── rate-limit.ts        # Per-IP rate limiter for /api/analyze and /api/repos
│   ├── utils.ts             # Class-name utility
│   └── validation.ts        # Zod schemas + URL/username parser
├── test/
│   └── setup.ts             # Vitest setup (jest-dom matchers)
├── components/*.test.tsx    # Component tests (Testing Library + jsdom)
├── app/api/*/route.test.ts  # Route-handler integration tests (Vitest)
├── lib/*.test.ts            # Unit tests for lib modules (Vitest)
├── e2e/                     # End-to-end browser tests (Playwright, mocked API routes)
├── .github/workflows/ci.yml # GitHub Actions: lint + test + build + E2E on every PR/push
├── docs/                    # GitHub Pages landing page
├── public/                  # Static assets
└── AGENTS.md                # Rules and conventions for AI coding agents
```

## API

The app exposes the following internal API routes used by the frontend.

### `GET /api/repos?username=<username>`

Returns **all** public repositories for a GitHub user, sorted by creation date (newest first). The route runs a single **GitHub GraphQL** query per page (up to 100 repos per page, cursor pagination) that also fetches each repo's top 5 languages in the same round-trip — so accounts with any number of public repos are fully covered with no per-repo requests. It requires `GITHUB_TOKEN` (GraphQL is not anonymous); the endpoint itself is rate-limited to **10 requests/min per IP**.

```json
{
  "username": "slaveofthecode",
  "total": 47,
  "repos": [
    {
      "id": 123456789,
      "name": "my-project",
      "description": "A short description of the repo.",
      "createdAt": "2024-01-15T10:00:00Z",
      "pushedAt": "2025-06-01T18:30:00Z",
      "languages": ["TypeScript", "CSS", "JavaScript"],
      "htmlUrl": "https://github.com/slaveofthecode/my-project"
    }
  ]
}
```

### Errors

| Status | Description |
|---|---|
| `400` | Missing or invalid `username` parameter |
| `404` | GitHub user not found |
| `429` | Too many requests for your IP, or GitHub rate limit reached |
| `500` | Unexpected server error |
| `503` | `GITHUB_TOKEN` not configured on the server (or invalid/expired) |

### `POST /api/analyze`

Streams an AI-generated markdown overview of a repository (purpose, key features, tech stack, code-health, suggested improvements, plus explanations and prioritization of any known vulnerabilities) generated by Gemini from its README and a deterministic OSV.dev scan. Before the narrative, the response also includes the deterministic vulnerability report read from the repo's dependency manifests.

Request body:

```json
{
  "owner": "slaveofthecode",
  "repo": "github-inspector-ai"
}
```

The response starts with a single JSON line (the vulnerability report):

```json
{"type":"vulns","manifestsAnalyzed":1,"vulnerabilities":[{ "id": "GHSA-xxx", "aliases": ["CVE-..."], "severity": "HIGH", "score": 7.5, "summary": "...", "affectedPackage": "lodash", "affectedVersions": [">=4.0.0 <4.17.21"] }]}
```

followed by the streamed markdown narrative. `manifestsAnalyzed` is the number of manifests found and parsed; `vulnerabilities` is empty when none are found or the repo declares no manifests. Results are cached for 6 hours per `owner/repo@commit`, and the endpoint is rate-limited to **10 requests/min per IP** (protects both GitHub's API and your Gemini quota):

| Status | Description |
|---|---|
| `400` | Invalid `owner`/`repo` or malformed body |
| `403` | Repository is private or not accessible |
| `404` | Repository not found |
| `429` | Too many analyses for your IP (try again in a minute) |
| `503` | `GEMINI_API_KEY` not configured on the server |
| `507` | AI provider quota exceeded or temporary model failure |

### `GET /api/health`

Diagnostic endpoint that reports whether the deployed server sees each required environment variable (without exposing secrets):

```json
{
  "status": "ok",
  "geminiConfigured": true,
  "geminiModel": "gemini-3.6-flash",
  "githubConfigured": true,
  "environment": "production"
}
```

Use it after redeploying to confirm Amplify injected the env vars.

## How vulnerability scanning works

When you run an AI analysis, the app doesn't stop at the README. It also reads the repository's dependency manifests (`package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Gemfile`) and checks every declared dependency against **OSV.dev** — a free, public database of known security advisories.

Think of it like a medication recall system: your project's `package.json` is the prescription, OSV.dev is the health authority's recall list, and each finding is a red flag that one of the drugs on that prescription has been pulled from the market.

The report uses a few terms worth knowing:

| Term | Meaning |
|---|---|
| **Vulnerability** | A bug in a library that can be exploited (remote code execution, injection, privilege escalation, ...). When one is found, the project that owns the library publishes a **security advisory** documenting it. |
| **CVE** (`CVE-2021-23337`) | The canonical, globally recognized identifier for a security advisory — the "patent number" of the vulnerability world. |
| **GHSA** (`GHSA-r5fr-rjxr-66jc`) | The same kind of advisory, but published through GitHub's own system. Many findings exist in both; the report shows each one with its aliases. |
| **Severity (CVSS)** | How dangerous a vulnerability is, scored 0–10: **9+ Critical**, **7–9 High**, **4–7 Medium**, **below 4 Low**, plus **Unknown** when the database doesn't say. |
| **Affected versions** | The exact version range that contains the bug (e.g. `>=4.0.0 <4.17.21`). If your declared version falls inside that range, you are affected. |

**Why this is deterministic — and why it must be:** every finding in the report comes from OSV.dev, a fixed, factual database. Large language models can confidently *invent* CVEs that don't exist, so the app never lets the AI be the source of a vulnerability. Gemini is only ever used to *explain* the findings (impact, priority, fix) and summarize the repository; the vulnerability list is generated by code against real data, and the model is instructed to reference only the entries it is given.

Example result for a repo with three pinned manifests (the JSON line streamed at the start of a `POST /api/analyze` response):

```json
{"type":"vulns","manifestsAnalyzed":3,"vulnerabilities":[
  {"id":"GHSA-fjxv-7rqg-78g4","aliases":["CVE-2025-7783"],"severity":"CRITICAL","score":9.8,"summary":"form-data vulnerable to prototype pollution in mime type parsing","affectedPackage":"form-data","affectedVersions":[">=0 <2.5.4"]},
  {"id":"GHSA-hrpp-h998-j3pp","aliases":["CVE-2022-24999"],"severity":"HIGH","score":7.5,"summary":"qs vulnerable to prototype pollution when using plain objects","affectedPackage":"qs","affectedVersions":[">=6.10.0 <6.10.3"]}
]}
```

The scan currently covers the five most common manifests and only **pinned** (exact) versions — ranges and lockfiles are not resolved yet, which is part of the robustness roadmap below.

## Testing

Four layers, run with [Vitest](https://vitest.dev) (under Bun) plus [Playwright](https://playwright.dev) for browser E2E:

- **Unit tests** (`lib/*.test.ts`) — validation schemas, cache TTL/eviction, rate limiting, manifest parsers, OSV.dev scanning, and the Gemini prompt builder.
- **Route-handler integration tests** (`app/api/*/route.test.ts`) — `GET /api/repos` and `POST /api/analyze` end-to-end with mocked GitHub GraphQL/REST, OSV.dev, and the AI stream: error codes, pagination, caching, deduplication, and rate limiting.
- **Component tests** (`components/*.test.tsx`) — `LanguageBadge` (icon/color mapping and fallbacks) and `RepoAnalysis` (streaming markdown, vulnerability report, error and cached states) rendered in jsdom with Testing Library.
- **End-to-end tests** (`e2e/*.spec.ts`) — Playwright against a real dev server with mocked API routes (so no live GitHub/Gemini calls): search flow, error/validation states, and the full analyze interaction.

```bash
bun run test         # unit + integration + component (Vitest) — runs once
bun run test:watch   # Vitest — re-runs on every change
bun run test:e2e     # Playwright E2E — headless, auto-starts the dev server
bun run test:ui      # Playwright UI mode — interactive inspector with a live browser
```

No API keys or network calls are needed to run any of these — GitHub and Gemini are mocked at every layer, so the suite is deterministic and safe to run anywhere.

Notes on the browser tests (Playwright):

- Playwright starts the dev server for you (`bun run dev` on port 3000). If a server is already running there, it is **reused** instead of starting a second one.
- First time, the browser binaries must be installed: `bunx playwright install chromium`.
- `bun run test:ui` opens the Playwright inspector: pick a spec (e.g. `e2e/analyze.spec.ts`) and watch it run step by step in a visible Chromium window, with pause-and-inspect.
- `bunx playwright test --headed` runs the whole E2E suite showing the browser window instead of headless.

GitHub Actions runs `lint`, `test`, `build`, and the Playwright E2E suite on every pull request and push to `main` (`.github/workflows/ci.yml`).

## What's next

- **Robustness & scale** — cache invalidation before the 6-hour TTL, lockfile-aware dependency resolution, and persisting cache/rate-limits (Upstash/Redis) if traffic demands it.
- **UI & features** — in-repo search/filtering, per-repo star/fork/archive counts, and AI portfolio summaries.

## Deployment

The project deploys to **AWS Amplify Hosting** (Free Tier — ~1000 build minutes/month, 5 GB storage, 15 GB transfer with Next.js SSR included), connected directly to your GitHub repository. Amplify auto-detects the Next.js SSR framework, deploys automatically on every push to `main` (no Dockerfile or CI pipeline to maintain), and provides HTTPS out of the box. GitHub Actions additionally runs lint, unit/integration/component tests, a production build, and the Playwright E2E suite on every PR and push to `main` as a safety net.

Set these environment variables in the Amplify console (App settings → Environment variables) for the **`main`** environment — without surrounding quotes:

| Variable | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | **Yes** | AI analysis. Create at https://aistudio.google.com |
| `GEMINI_MODEL` | Yes* | Optional; defaults to `gemini-3.6-flash` in `lib/ai.ts` |
| `GITHUB_TOKEN` | **Yes** | Required for the repo listing (GitHub GraphQL; read-only perms are enough). Invalid/missing token → `GET /api/repos` returns `503` |

\* `GEMINI_MODEL` is optional. After adding or changing env vars, **redeploy** (Amplify injects them at build/deploy time, not on save). Verify with `GET /api/health` — it reports whether the deployed server sees each variable.

For a quick start elsewhere, Vercel works out of the box:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fslaveofthecode%2Fgithub-inspector-ai)

See the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for other options.

## Author

**Gustavo Lopez** — Full-stack software engineer.

- GitHub: [github.com/slaveofthecode](https://github.com/slaveofthecode)
- Project site: [https://main.d22y0lq8a3u6xm.amplifyapp.com](https://main.d22y0lq8a3u6xm.amplifyapp.com)
- LinkedIn: [https://www.linkedin.com/in/gustavoml](https://www.linkedin.com/in/gustavoml/)