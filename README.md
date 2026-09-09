# GitHub Inspector

Inspect any GitHub user's public repositories, top technologies, and metadata from a single, clean interface. Paste a GitHub URL or username, and get an instant, readable overview of their repos — sorted by creation date, with their top programming languages.

| | |
|---|---|
| **Site** | https://main.d22y0lq8a3u6xm.amplifyapp.com |
| **Status** | Active development — repo insights live · dependency vulnerability scan coming soon |

## Features

- **Search by URL or username** — paste `https://github.com/user` or just `user`; the app extracts and validates the account for you.
- **All public repositories, no caps** — the server-side route paginates through every page of the GitHub REST API, so accounts with 100+ repos are fully listed.
- **Sort by Created Date or Last Commit** — toggle the ordering right from the sticky results header.
- **Top languages per repository with brand icons** — the 5 most-used technologies of every repo, based on byte usage from the GitHub API, rendered with brand icons.
- **Key metadata at a glance** — creation date and last-commit date on every card.
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
│   ├── api/repos/route.ts   # API route: calls GitHub REST API (paginated)
│   ├── layout.tsx           # Root layout, fonts, metadata
│   └── page.tsx             # Home page UI + search logic
├── components/
│   ├── language-badge.tsx   # Language labels with brand icons
│   └── ui/                  # shadcn/ui components (button, card, badge, ...)
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

## What's next

- **Dependency vulnerability scan** — detect known security vulnerabilities (CVEs) in each repository's dependencies via OSV.dev, presented in plain language.
- **Vulnerability explanations** — optional AI analysis that prioritizes and explains each finding (coming in a later release).

The full long-term vision is documented in [ROADMAP.md](./ROADMAP.md).

## Deployment

The project deploys to **AWS Amplify Hosting** (Free Tier — ~1000 build minutes/month, 5 GB storage, 15 GB transfer with Next.js SSR included), connected directly to your GitHub repository. Amplify auto-detects the Next.js SSR framework, deploys automatically on every push to `main` (no Dockerfile or CI pipeline to maintain), and provides HTTPS out of the box. Set `GITHUB_TOKEN` (and later `GEMINI_API_KEY`) as environment variables in the Amplify console. See [ROADMAP.md](./ROADMAP.md) for the full AWS plan.

For a quick start elsewhere, Vercel works out of the box:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fslaveofthecode%2Fgithub-inspector-ai)

See the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for other options.

## Author

**Gustavo Lopez** — Full-stack software engineer.

- GitHub: [github.com/slaveofthecode](https://github.com/slaveofthecode)
- Project site: [https://main.d22y0lq8a3u6xm.amplifyapp.com](https://main.d22y0lq8a3u6xm.amplifyapp.com)
- LinkedIn: [https://www.linkedin.com/in/gustavoml](https://www.linkedin.com/in/gustavoml/)