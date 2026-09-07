# GitHub Inspector

Inspect any GitHub user's public repositories, top technologies, and metadata from a single, clean interface. Paste a GitHub URL or username, and get an instant, readable overview of their repos — sorted by creation date, with their top programming languages.

| | |
|---|---|
| **Site** | https://slaveofthecode.github.io/github-inspector-ai |
| **Status** | Active development |

## Features

- **Search by URL or username** — paste `https://github.com/user` or just `user`; the app extracts and validates the account for you.
- **Top languages per repository** — the 5 most-used technologies of every repo, based on byte usage from the GitHub API.
- **Key metadata at a glance** — creation date and last-commit date on every card.
- **Direct links** — each repository opens on GitHub in a new tab.
- **Infinite scroll** — results load progressively as you scroll; no pagination clicks.
- **Smart loading states** — skeleton cards while fetching, clear empty and error states.
- **Dark, modern UI** — built with Tailwind CSS and shadcn/ui components.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router) |
| UI | React 19 + [Tailwind CSS 4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) |
| Language | TypeScript |
| Validation | [Zod](https://zod.dev) (client and server) |
| Package manager | [Bun](https://bun.sh) |
| Backend | Next.js Route Handlers (`/api/repos`) |

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
│   ├── api/repos/route.ts   # API route: calls GitHub REST API
│   ├── layout.tsx           # Root layout, fonts, metadata
│   └── page.tsx             # Home page UI + search logic
├── components/ui/           # shadcn/ui components (button, card, badge, ...)
├── lib/
│   ├── utils.ts             # Class-name utility
│   └── validation.ts        # Zod schemas + URL/username parser
├── docs/                    # GitHub Pages landing page
├── public/                  # Static assets
├── ROADMAP.md               # Feature roadmap and future plans
└── PLAN.md                  # Implementation plan (how it was built)
```

## API

The app exposes a single internal API route used by the frontend.

### `GET /api/repos?username=<username>`

Returns public repositories for a GitHub user, sorted by creation date (newest first).

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

## Roadmap

The long-term vision for the project — including AI-powered summaries, dependency/vulnerability analysis, and CVE explanations — is documented in [ROADMAP.md](./ROADMAP.md).

## Deploy on Vercel

The easiest way to deploy the app:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fslaveofthecode%2Fgithub-inspector-ai)

See the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for other options.

## Author

**Gustavo Lopez** — Full-stack software engineer.

- GitHub: [github.com/slaveofthecode](https://github.com/slaveofthecode)
- Project site: [https://slaveofthecode.github.io/github-inspector-ai](https://slaveofthecode.github.io/github-inspector-ai)
- LinkedIn: [https://www.linkedin.com/in/gustavoml](https://www.linkedin.com/in/gustavoml/)