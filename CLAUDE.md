# URL Shortener API

## What This Is
Monorepo URL shortener service with API and admin UI packages.

## NalaN Integration (Current)

- Memory persistence and retrieval use `~/.nalan/memory/memory.db`.
- Task delegation uses agents (`/nalan:spawn`, `/nalan:agents`; `/nalan:workers` is legacy alias).
- Worktree-based agents receive dirty/untracked overlay from this repo at spawn time.

## Tech Stack
- Node.js — Runtime
- npm workspaces — Monorepo management

## Development
```bash
npm run dev          # Start API dev server
npm run dev:api      # API only
npm run dev:ui       # Admin UI only
npm run test         # Run API tests
npm run test:coverage # Coverage report
npm run build        # Build all packages
```

## Packages
- `@url-shortener/api` — Core API service
- `@url-shortener/admin-ui` — Admin interface

## Key Directories
- `packages/api/` — API implementation
- `packages/admin-ui/` — Admin UI

---
*URL shortening service with admin dashboard*
