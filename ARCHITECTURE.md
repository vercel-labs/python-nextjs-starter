# Margin architecture

Margin provides a catalog, reader accounts, saved bookshelves, and administrator catalog CRUD. Next.js owns rendering and browser interactions; FastAPI owns authentication, authorization, and persistence. See [README.md](README.md) for setup and [AGENTS.md](AGENTS.md) for implementation rules.

## Services and ownership

```text
Browser → Next.js frontend → private FastAPI service → Neon Postgres
             frontend/           backend/
```

Root `vercel.json` declares both services, injects Python's URL as the frontend-only `BACKEND_URL`, and routes public traffic to Next.js. FastAPI starts at `app.main:app`. Services keep separate dependencies/runtimes in one deployment. Only Python connects to the database; no backend route is publicly rewritten.

## Component map

| Component | Files | Responsibility |
| --- | --- | --- |
| Pages and UI | `frontend/app/`, `frontend/components/` | Route shells, filters, account/admin controls, CSS covers |
| Public reads | `frontend/lib/catalog.ts`, `frontend/lib/backend.ts` | Cookie-free Python reads and catalog caching |
| API bridge | `frontend/app/api/backend/[...path]/route.ts` | Transport validation, cookie forwarding, invalidation |
| Private state | `frontend/components/session.tsx`, `frontend/components/bookshelf.tsx`, `frontend/lib/bookmark.ts` | Account state and streamed bookmark snapshot |
| Browser synchronization | `frontend/lib/state-events.ts` | Fixed change signals across tabs and resume refresh |
| Python API | `backend/app/main.py`, `backend/app/auth.py`, `backend/app/schemas.py` | Validation, sessions, permissions, throttles |
| Persistence/setup | `backend/app/database.py`, `backend/app/models.py`, `backend/migrations/`, `backend/scripts/` | Connections, schema, bootstrap, operator tools |

## Request flow

| Operation | Path and behavior |
| --- | --- |
| Catalog/detail render | Server Component → cached public reader → Python `/books` or `/books/{id}` |
| Session/bookmark leaf | Nested Suspense → uncached `/auth/me` and `/shelf` calls, request-local deduplication |
| Browser interaction | Same-origin `/api/backend/*` → allowlisted Route Handler → private Python endpoint |
| Catalog write | Python checks admin and commits → bridge expires catalog tag → browser/router refresh |
| Bookmark write | Python derives current user and commits → account-scoped browser state updates and revalidates |

The bridge permits only catalog, auth, shelf, and health paths; it checks exact scheme/host Origin for writes, rejects cross-site requests, caps JSON bodies at 16 KiB, and forwards only the chosen session cookie. Cloud checks use Host directly; local Services trusts its loopback proxy's forwarded host. Do not expose that development server publicly. Upstream calls have a 15-second timeout; backend failures become safe 503 responses. Backend documentation routes are not exposed by the bridge.

## Data model

| Table | Responsibility / constraints |
| --- | --- |
| `books` | Fictional catalog; string ID, bounded metadata, integer USD cents, stock |
| `users` | UUID, unique normalized email, name, Argon2id hash, admin role |
| `sessions` | SHA-256 token digest, user foreign key, absolute expiration |
| `shelf_items` | User/book foreign keys and unique `(user_id, book_id)` |
| `auth_limits` | Hashed email/action or global/action key, attempt count, window start |
| `bookstore_bootstrap` | Completion markers: catalog row 1, administrator row 2 |
| `alembic_version` | Applied schema revision |

Book deletion cascades to saved references. Every shelf operation scopes to the authenticated user. SQLAlchemy uses request-scoped sessions, parameterized queries, and `NullPool`; Neon supplies the pooled runtime connection. The engine configuration may be cached, but user/request state is never global. Postgres is required in application environments; temporary SQLite is enabled only in isolated tests.

## Authentication and authorization

Python hashes passwords with Argon2id (64 MiB, three iterations, four lanes). New passwords require 15–128 characters; login preserves existing-password compatibility and upgrades outdated hashes. Unknown email logins verify a dummy hash instead of skipping password hashing.

Sessions use random 256-bit opaque tokens; only SHA-256 digests persist. Cloud cookies use `__Host-margin_session`, Secure, HttpOnly, SameSite=Lax, Path=/, and no Domain. Local HTTP uses `margin_session`. Login/registration revoke the presented session before replacing it; logout deletes its digest, preventing replay. The absolute lifetime is seven days. Expired rows are pruned when issuing sessions.

Database-backed throttles allow ten attempts per email/action and 100 per action globally in ten minutes, with atomic updates and row locking. The global budget bounds hashing work but can block legitimate users during abuse; edge controls are still needed.

Public signup always creates a reader. Catalog writes require the current admin role; shelf access requires the current user. Private bindings provide connectivity, not user authorization. Initial admin credentials create a normal database user once; they do not bypass session auth or provide a permanent environment-based login.

## Caching and private state

| State | Scope | Refresh behavior |
| --- | --- | --- |
| Public catalog | `use cache: remote`; stale 300s, revalidate 60s, expire 3600s | List, details, and missing-book results share `public-books` |
| Python reads | `no-store` | Public cache controls reuse; authenticated responses stay uncached |
| Bookmark deduplication | React `cache()` within one render | No private data persists across users |
| Prefetched routes | Browser route cache | Router refresh after catalog writes; other devices can retain content until stale/refreshed |
| Session/bookshelf | Account-scoped browser memory | Confirmed writes update and revalidate; tab signals and resume events refresh |

Next.js enables Cache Components and partial prefetching; catalog/detail routes export `instant = true` for development validation. Runtime `await headers()` stays outside cache scope, allowing service access during rendering/prefetching without putting visitor headers or cookies in cache keys. Book links explicitly prefetch detail content; prefetching is disabled in development. Vercel supplies remote caching when deployed; Next uses its default handler locally.

Only backend 404s become cached `null` details; other failures reach a retryable error boundary. Successful bridge writes expire `public-books` after Python commits, then refresh the editing browser. Same-origin BroadcastChannel signals refresh other tabs using fixed categories, never private payloads. Operator writes bypass invalidation; TTL revalidation is the fallback. These mechanisms do not push updates across devices. Cached stock/prices cannot authorize future transactions.

The featured book and catalog share a component-level `catchError` boundary while retaining independent Suspense loading states. Catalog failures retain the filter/error UI and use the boundary's `retry()` to recover both sections with fresh server content. A separate bookmark boundary falls back to the same browser-backed control if the private server snapshot fails, without replacing the public book page. Server reads let framework rendering signals propagate rather than catching them manually.

The bookmark leaf has its own Suspense boundary, keeping authenticated reads from blocking the public book. Known browser shelf state overrides prefetched snapshots. BookshelfProvider owns records, pending actions, and feedback; mutation versions and read sequencing reject stale responses. Account changes remount it. Failed reads expose retry and disable mutations. Focus, visibility, and back/forward-cache restoration refresh account data. No bookmarks or tokens enter localStorage or shared caches.

## Environment and release lifecycle

Configure independent Neon resources and credentials for Development, Preview, and Production through the README commands. This checkout contains no provisioning automation. Local Services reads Development `.env.local`; deployed builds read their environment. Deployments using one Preview resource share accounts and catalog changes; per-PR branching requires additional automation.

`backend/scripts/deploy_setup.py` runs as the Python build command. It connects directly using `DATABASE_URL_UNPOOLED` (or `POSTGRES_URL_NON_POOLING`), acquires a session advisory lock with a 60-second limit, and passes the connection to Alembic. Pending migrations apply before bootstrap. Fresh databases seed 12 books once; existing migrated catalogs are marked complete without reseeding. Subsequent builds preserve edits/deletions.

A separate marker initializes the configured administrator. Both admin variables absent skips it; incomplete/invalid values fail with sanitized errors. Existing admins are preserved and reader collisions fail. Account creation and marker completion commit together; later builds cannot reset credentials/roles, switch the admin email, or recreate a deleted account. Explicit `scripts.promote_admin` remains available for authorized operators. `scripts.seed` restores missing demo books without changing edited records, and never creates accounts.

Nothing migrates/seeds during import, requests, or frontend builds. `BOOKSTORE_SKIP_DEPLOY_SETUP=1` permits operator-managed releases; setup must then run explicitly with direct credentials and the skip value unset. Use backwards-compatible migrations: database changes can precede deployment promotion. Variable changes affect new deployments only. Vercel Secrets cannot be downloaded for operator/local use.

## Observability

`frontend/lib/observability.ts` uses evlog; `backend/app/observability.py` uses structlog with ASGI middleware and restored request context. JSON summaries go to Vercel Runtime Logs without an external transport or logging key.

The bridge returns `x-request-id` and forwards it to Python. Dependency calls add `x-call-id`. Frontend/backend events share `requestId`; dependency events also share `callId`. Approved fields include known route templates, method, status, duration, service, environment, deployment, and region. Bodies, query strings, arbitrary paths, emails, IPs, cookies, credentials, SQL parameters, and raw errors are excluded.

Cache hits make no Python call. Bookmark reads have their own operation ID; a whole navigation is not one distributed trace. Dependency timing ends at response headers, bridge timing at response return, and Python timing covers its response lifecycle. These are not query or browser-render timings. Application exclusions do not control platform retention; external drains are not configured.

Production Web Analytics emits confirmed bookmark events with a fixed UI source, never user/book/request IDs. Custom events require dashboard enablement and Pro or Enterprise. Collection failures cannot interrupt writes; analytics is not an audit log.

## Verification

[README checks](README.md#checks) cover type checking, lint, production build, and Python tests. `backend/tests/` covers API authorization/isolation, sessions, throttles, bootstrap behavior, and logging contracts.

Tests use isolated SQLite; API fixtures create tables from ORM metadata. Bootstrap tests exercise migrations on SQLite, but do not establish PostgreSQL advisory/row-lock behavior. They do not test the Next.js bridge or browser flows. Verify persistence changes against disposable Neon data and affected flows through `vercel dev -L`; check mobile/desktop layouts and keyboard navigation. There is no automated browser suite.

## Customize

| Change | Files |
| --- | --- |
| Branding and styles | `frontend/app/layout.tsx`, `frontend/app/globals.css`, `frontend/components/header.tsx` |
| Catalog, covers, accounts, admin UI | `frontend/components/` |
| Public caching | `frontend/lib/catalog.ts` |
| API and permissions | `backend/app/main.py`, `backend/app/auth.py` |
| Models and validation | `backend/app/models.py`, `backend/app/schemas.py` |
| Demo books | `backend/scripts/seed.py` |
| Schema migrations | `backend/migrations/versions/` |
| Services and routing | `vercel.json` |

## UI and extension boundaries

Shared CSS provides light/dark tokens, self-hosted Geist fonts, contrast, tabular numbers, labeled forms, and reduced motion. Covers are HTML/CSS artwork. Preserve keyboard focus, pending/error feedback, responsive layouts, and modal scroll stability.

The catalog returns at most 100 books; browser filters cover only those records. Add pagination/server filtering for growth. Saved books are a wishlist; checkout/payments are absent. Uploaded covers require object storage.

Real accounts need verification, password recovery/change, MFA, idle expiration, deletion, and session management. Add edge abuse controls and auth-record cleanup. Separate runtime/migration roles, review backup/restore, and strengthen TLS/CSP as needed: the code accepts `sslmode=require`, and CSP does not restrict scripts.

For new features, define Python schema/permissions, add a migration, extend the bridge allowlist, then build the UI and invalidation. Keep business rules in Python.
