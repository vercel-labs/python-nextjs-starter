# AGENTS.md

Guidance for coding agents working in this repository.

## Project overview

Margin is a Next.js + FastAPI bookstore deployed as one Vercel Services project. Next.js owns rendering and the browser API bridge; Python owns authentication, authorization, Neon persistence, catalog CRUD, and saved books. Orders, checkout, and payments are outside the current scope. Keep the starter small and usable without paid features.

Read [README.md](README.md) for setup and [ARCHITECTURE.md](ARCHITECTURE.md) for data flow and boundaries. Keep all repository documentation in these four root files: README.md, AGENTS.md, CLAUDE.md, ARCHITECTURE.md. CLAUDE.md is only a pointer here.

## Setup and commands

```sh
npm ci --prefix frontend
cd backend
uv sync --extra dev --locked
uv run --env-file ../.env.local python -m scripts.deploy_setup
cd ..
vercel dev -L

# From the repository root:
npm run check
npm run build
cd backend
uv run --extra dev pytest -q
```

Provision environment-scoped Neon resources and Development admin credentials first, using README instructions. Root `.env.local` contains only Development values. Run Services from the root; running Next.js alone does not supply the private Python binding.

Verify substantive changes with the relevant checks above and exercise affected UI/API flows through Services. For auth changes include anonymous, wrong-role, and another-user cases. For persistence changes also verify migrations and queries against disposable Postgres data; automated API tests use temporary SQLite. Do not reset deployed databases or exercise destructive CRUD on real records.

## Code map

| Location | Responsibility |
| --- | --- |
| `frontend/app/` | Routes, layouts, streamed components, same-origin bridge |
| `frontend/components/` | Catalog, account, bookshelf, administrator UI |
| `frontend/lib/` | API helpers, shared types, observability |
| `frontend/app/globals.css` | Design tokens, responsive styles, accessibility states |
| `backend/app/` | Routes, schemas, models, auth, database, request logs |
| `backend/migrations/` | Versioned Alembic schema changes |
| `backend/scripts/` | Deployment bootstrap, explicit seeding, operator promotion |
| `backend/tests/` | Isolated API/database tests |
| `vercel.json` | Service roots, private binding, public routing |

## Code style and conventions

- Follow existing TypeScript/TSX and Python patterns: typed props/API models, double-quoted strings, two-space frontend indentation, four-space Python indentation. Use PascalCase components, camelCase TypeScript identifiers, and snake_case Python identifiers.
- Reuse existing components and CSS tokens before adding dependencies. Keep labeled forms, keyboard focus, reserved loading space, responsive layouts, and reduced-motion support.
- Use SQLAlchemy parameterized queries and bounded Pydantic models. Store prices as integer cents; add an Alembic migration for every schema change.
- Update `frontend/package-lock.json` or `backend/uv.lock` with dependency changes. Confirm framework APIs against the installed Next.js documentation rather than inventing configuration.
- Update README when commands/environment setup change and ARCHITECTURE when ownership, data flow, or guarantees change. Avoid dated test transcripts and duplicated walkthroughs in repository docs.

## Authentication and data boundaries

- Enforce permissions in Python on every protected operation. Public registration always creates readers; shelf queries derive ownership from the session, never a submitted user ID.
- Keep database access, password verification, and authorization out of browser code. Never expose `DATABASE_URL` or `BACKEND_URL` with a `NEXT_PUBLIC_` prefix or add a public backend rewrite for convenience.
- Preserve the bridge path allowlist, exact-origin write checks, bounded JSON bodies, selected-cookie forwarding, and safe errors. Preserve HttpOnly cookies and server-side session revocation.
- Bootstrap only an operator-configured admin, once per database. Keep credential validation sanitized, reject reader collisions, and preserve the completion marker; later builds must not reset passwords/roles or recreate deleted accounts. Use explicit operator promotion for later admins. Never ship default credentials or first-user promotion.
- Development, Preview, and Production use independent Neon resources. SQLite is allowed only in isolated tests with `BOOKSTORE_TESTING=1`, never on Vercel.
- Migrate/bootstrap through the documented backend build or operator command under the direct-connection lock, never during import, requests, or frontend builds. Preserve one-time catalog seeding and edited/deleted records.

## Cache and state conventions

- Shared persistent caching contains public catalog data only. Keep runtime service access outside the public cache scope and visitor headers/cookies/IDs out of cache arguments.
- Keep authenticated reads uncached and bookmark controls inside their own Suspense boundary. React `cache()` deduplicates a render's reads; it is not shared persistent user caching.
- Use `catchError` boundaries for component-level rendering recovery and let server reads propagate framework control-flow signals. Preserve the shared featured/catalog retry and the separate browser-backed bookmark fallback.
- Expire `public-books` only after Python commits catalog writes. Preserve router refresh, cross-tab change categories, resume refresh, and guards against stale reads overwriting completed mutations.
- A backend 404 may produce the missing-book view; transient failures must reach a recoverable error boundary. Stock and prices are cached display values, not transaction guarantees.

## Logging conventions

Preserve evlog/structlog JSON summaries, shared `requestId`, and distinct dependency `callId`. Log only approved fields and known route templates. Never log credentials, session tokens, cookies, bodies, query strings, arbitrary paths, database URLs, or raw exception messages. Restore Python context variables after each request. IDs correlate operations; they are neither authorization nor distributed trace IDs.

## Repository hygiene

Ignore environment files, `.vercel`, virtual environments, generated service-local agent guidance, and private QA artifacts. Do not commit project linkage or credentials. Keep technical rationale in code comments; keep setup, implementation guidance, and architectural explanations in their respective root documents.
