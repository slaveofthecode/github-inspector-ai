# GitHub Inspector

Inspect any GitHub user's public repositories, top technologies, and metadata from a single, clean interface. Paste a GitHub URL or username, and get an instant, readable overview of their repos — sorted by creation date, with their top programming languages.

| | |
|---|---|
| **Site** | https://main.d22y0lq8a3u6xm.amplifyapp.com |
| **Status** | Active development — repo insights and dependency vulnerability scan live · AI vulnerability explanations coming soon |

## Features

- **Search by URL or username** — paste `https://github.com/user` or just `user`; the app extracts and validates the account for you.
- **All public repositories, no caps** — the server-side route paginates through every page of the GitHub REST API, so accounts with 100+ repos are fully listed.
- **Sort by Created Date or Last Commit** — toggle the ordering right from the sticky results header.
- **Top languages per repository with brand icons** — the 5 most-used technologies of every repo, based on byte usage from the GitHub API, rendered with brand icons.
- **Key metadata at a glance** — creation date and last-commit date on every card.
- **AI repository summaries** — click "Analyze Repository with AI" on any card to stream a structured markdown overview (purpose, key features, tech stack, code-health, and suggested improvements) generated live by Gemini from the repo's README.
- **Deterministic vulnerability scan** — during analysis the app reads the repo's dependency manifests (`package.json`, `requirements.txt`, `Cargo.toml`, `go.mod`, `Gemfile`) and checks them against OSV.dev, showing severity-ranked CVEs/GSHAs with their affected versions and aliases. No AI is involved in finding vulnerabilities, so results are factual.
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

### GitHub token (optional)

The app works without a token, but GitHub's anonymous limit is **60 requests/hour**. Add a [Personal Access Token](https://github.com/settings/tokens) to `.env.local` to raise it to **5,000 requests/hour**:

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

## Project Structure

```
github-inspector-ai/
├── app/
│   ├── api/analyze/route.ts # POST: streamed AI summary from README (cached + rate-limited)
│   ├── api/repos/route.ts   # GET: calls GitHub REST API (paginated)
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
│   ├── rate-limit.ts        # Per-IP rate limiter for /api/analyze
│   ├── utils.ts             # Class-name utility
│   └── validation.ts        # Zod schemas + URL/username parser
├── docs/                    # GitHub Pages landing page
├── public/                  # Static assets
└── AGENTS.md                # Rules and conventions for AI coding agents
```

## API

The app exposes a single internal API route used by the frontend.

### `GET /api/repos?username=<username>`

Returns **all** public repositories for a GitHub user, sorted by creation date (newest first). The GitHub REST API is paginated server-side (up to 100 repos per page), so accounts with any number of public repos are fully covered.

```json
{
  "username": "slaveofthecode",
  "total": 12,
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
| `429` | GitHub API rate limit reached (try again later) |
| `500` | Unexpected server error |

### `POST /api/analyze`

Streams an AI-generated markdown overview of a repository (purpose, key features, tech stack, code-health, suggested improvements) generated by Gemini from its README. Before the narrative, the response also includes a deterministic vulnerability report read from the repo's dependency manifests.

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

**Why this is deterministic — and why it must be:** every finding in the report comes from OSV.dev, a fixed, factual database. Large language models can confidently *invent* CVEs that don't exist, so the app never lets the AI be the source of a vulnerability. Gemini is only ever used to summarize a repository; the vulnerability list is generated by code against real data. An upcoming release will let the AI *explain* and prioritize the deterministic findings — always keeping OSV.dev as the only source of the CVEs themselves.

Example result for a repo with three pinned manifests (the JSON line streamed at the start of a `POST /api/analyze` response):

```json
{"type":"vulns","manifestsAnalyzed":3,"vulnerabilities":[
  {"id":"GHSA-fjxv-7rqg-78g4","aliases":["CVE-2025-7783"],"severity":"CRITICAL","score":9.8,"summary":"form-data vulnerable to prototype pollution in mime type parsing","affectedPackage":"form-data","affectedVersions":[">=0 <2.5.4"]},
  {"id":"GHSA-hrpp-h998-j3pp","aliases":["CVE-2022-24999"],"severity":"HIGH","score":7.5,"summary":"qs vulnerable to prototype pollution when using plain objects","affectedPackage":"qs","affectedVersions":[">=6.10.0 <6.10.3"]}
]}
```

The scan currently covers the five most common manifests and only **pinned** (exact) versions — ranges and lockfiles are not resolved yet, which is part of the robustness roadmap below.

## What's next

- **Vulnerability explanations** — AI that prioritizes and explains each deterministic OSV.dev finding (impact in that specific repo and suggested fixes), keeping OSV.dev as the only source of CVEs. Includes two-phase rendering: the CVE list first, then the narrative.
- **Robustness & scale** — persist cache/rate-limits (Upstash/Redis) if traffic demands it, per-user repo limits, a strict Gemini timeout, and rate-limiting on `GET /api/repos`.

## Deployment

The project deploys to **AWS Amplify Hosting** (Free Tier — ~1000 build minutes/month, 5 GB storage, 15 GB transfer with Next.js SSR included), connected directly to your GitHub repository. Amplify auto-detects the Next.js SSR framework, deploys automatically on every push to `main` (no Dockerfile or CI pipeline to maintain), and provides HTTPS out of the box.

Set these environment variables in the Amplify console (App settings → Environment variables) for the **`main`** environment — without surrounding quotes:

| Variable | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | **Yes** | AI analysis. Create at https://aistudio.google.com |
| `GEMINI_MODEL` | Yes* | Optional; defaults to `gemini-3.6-flash` in `lib/ai.ts` |
| `GITHUB_TOKEN` | No | Recommended; raises GitHub API rate limit from 60 to 5,000 requests/hour |

\* `GEMINI_MODEL` is optional. After adding or changing env vars, **redeploy** (Amplify injects them at build/deploy time, not on save). Verify with `GET /api/health` — it reports whether the deployed server sees each variable.

For a quick start elsewhere, Vercel works out of the box:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fslaveofthecode%2Fgithub-inspector-ai)

See the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for other options.

## Author

**Gustavo Lopez** — Full-stack software engineer.

- GitHub: [github.com/slaveofthecode](https://github.com/slaveofthecode)
- Project site: [https://main.d22y0lq8a3u6xm.amplifyapp.com](https://main.d22y0lq8a3u6xm.amplifyapp.com)
- LinkedIn: [https://www.linkedin.com/in/gustavoml](https://www.linkedin.com/in/gustavoml/)