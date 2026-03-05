# VibeCheck

Security scanner for vibe-coded projects. Paste a GitHub repo URL and get an interactive security checklist with one-click Cursor IDE fix prompts.

## What it detects

- **24 security vulnerability categories**: SQL injection, XSS, SSRF, CSRF, hardcoded secrets, broken auth, command injection, and more
- **11 scalability issue categories**: N+1 queries, missing pagination, memory leaks, race conditions, and more
- **Dependency CVEs**: Known vulnerabilities in npm, pip, bundler, and Go packages

## How it works

1. **Static analysis** via Semgrep with OWASP, security-audit, and custom vibe-code rulesets
2. **Secret detection** via Gitleaks
3. **Dependency audit** via npm audit, pip-audit, etc.
4. **AI-powered contextual review** via Claude Sonnet 4 for logic-level issues static tools miss
5. **Interactive checklist report** with copy-to-Cursor prompts for every finding

## Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 16+ and Redis 7+ (via `brew install postgresql@16 redis`)
- [Semgrep](https://semgrep.dev/docs/getting-started/) (`brew install semgrep`)
- [Gitleaks](https://github.com/gitleaks/gitleaks) (`brew install gitleaks`)
- Anthropic API key (for AI review, optional — get one at https://console.anthropic.com)

### Quick Start

```bash
# Clone the repo
git clone <your-repo-url>
cd vibecheck

# Install dependencies
npm install

# Start PostgreSQL and Redis
docker compose up -d

# Copy env file and fill in values
cp .env.example .env

# Run database migrations
npx prisma migrate dev --name init

# Generate Prisma client
npx prisma generate

# Start the dev server
npm run dev

# In a separate terminal, start the scan worker
npx tsx --tsconfig tsconfig.json src/workers/scan-worker.ts
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `ANTHROPIC_API_KEY` | No | Anthropic API key for AI-powered review (Claude Sonnet 4) |
| `GITHUB_CLIENT_ID` | No | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | No | GitHub OAuth app client secret |
| `NEXTAUTH_SECRET` | Yes | Random string for session encryption |

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **Queue**: BullMQ + Redis
- **UI**: Tailwind CSS + shadcn/ui
- **Analysis**: Semgrep, Gitleaks, npm audit, Claude Sonnet 4
