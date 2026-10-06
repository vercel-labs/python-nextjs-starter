# ▲ Next.js + Python Starter

A bookstore template with a Next.js frontend and FastAPI backend, deployed together through [Vercel Services](https://vercel.com/docs/services). Python handles authentication, permissions, and Neon Postgres; Next.js handles the UI through a private service binding. Checkout and payments are outside the starter’s scope.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fpython-nextjs-starter&project-name=python-nextjs-starter&repository-name=python-nextjs-starter&products=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%5D&env=ADMIN_EMAIL%2CADMIN_PASSWORD&envDescription=Choose%20your%20administrator%20email%20and%20a%20unique%20password%20of%2015-128%20characters.%20No%20default%20credentials%20are%20provided.&envLink=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fpython-nextjs-starter%23deploy)

## Deploy

1. Click **Deploy with Vercel** to create your repository and connect Neon.
2. Set `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` of 15–128 characters. The build prepares the database and creates your administrator.
3. Open the deployment, sign in, and select **Manage shop**.

Keep the Vercel project's Root Directory at the repository root.

> [!IMPORTANT]
> Before local development or Previews, scope the button-created Neon resource to **Production** in Vercel's Storage/integration settings. Development and Preview each need a separate Neon resource and distinct admin credentials.

## Local development

**Requirements:** Node.js 22, npm, Python 3.12–3.14, [uv](https://docs.astral.sh/uv/getting-started/installation/), and the [Vercel CLI](https://vercel.com/docs/cli) (`npm install -g vercel@latest`).

### 1. Connect Development

Clone your deployed repository and run from its root:

```sh
vercel link
vercel integration add neon --name bookstore-development --plan free_v3 --metadata region=iad1 --metadata auth=false --environment development --no-env-pull
vercel env add ADMIN_EMAIL development --no-sensitive
vercel env add ADMIN_PASSWORD development --no-sensitive
vercel env pull .env.local --environment development
```

Select your deployed project. Use a unique resource name if needed. Development values are readable for local setup; keep `.env.local` private and ignored.

### 2. Install and initialize

```sh
npm ci --prefix frontend
cd backend
uv sync --extra dev --locked
uv run --env-file ../.env.local python -m scripts.deploy_setup
cd ..
```

### 3. Start both services

```sh
vercel dev -L
```

Open the printed URL. Register a reader, save a book, and visit **My bookshelf**. Use your Development admin credentials to manage books. Keep `uv` on your PATH and run Services from the root.

## Preview and Production

Before your first Preview, connect its database and configure its administrator:

```sh
vercel integration add neon --name bookstore-preview --plan free_v3 --metadata region=iad1 --metadata auth=false --environment preview --no-env-pull
vercel env add ADMIN_EMAIL preview --no-sensitive
vercel env add ADMIN_PASSWORD preview --sensitive
```

Mark the Production admin password as a Secret in Vercel, too. Use different passwords in each environment. Secrets cannot be pulled for local use.

Deploy changes from the repository root:

```sh
vercel deploy        # Preview
vercel deploy --prod # Production, after review
```

Builds apply migrations and initialize each catalog/admin once; later builds preserve edits, deletions, and credentials. Changing bootstrap variables does not reset a password. Preview deployments share one Preview database.

See [release setup](ARCHITECTURE.md#environment-and-release-lifecycle) for operator-managed migrations. Keep Preview protection enabled and use `vercel curl` for authenticated checks.

## Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon pooled connection for runtime queries |
| `DATABASE_URL_UNPOOLED` | Neon direct connection for migrations/setup |
| `BACKEND_URL` | Injected by Services; no manual value needed |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Your initial administrator in each environment |

Database connections require TLS. Keep credentials and service URLs server-side, without `NEXT_PUBLIC_` prefixes. Public signup always creates readers.

<details>
<summary>Optional configuration and additional administrators</summary>

- `POSTGRES_URL_NON_POOLING` is accepted instead of `DATABASE_URL_UNPOOLED`.
- `ADMIN_NAME` defaults to `Bookshop owner`.
- `BOOKSTORE_SKIP_DEPLOY_SETUP=1` delegates setup to an operator; see the release documentation above.
- `VERCEL_ENV` is supplied by Vercel for cookies, logging, and Production analytics.
- To promote a registered reader, run from `backend/` against the intended database:

```sh
uv run --env-file ../.env.local python -m scripts.promote_admin your-account@example.com
```

Bootstrap rejects a reader email collision and never resets an existing administrator.

</details>

## Checks

```sh
npm run check
npm run build
cd backend
uv run --extra dev pytest -q
```

Tests use isolated SQLite. Verify persistence changes against disposable Postgres data through Services; see [verification](ARCHITECTURE.md#verification).

<details>
<summary>Troubleshooting and logs</summary>

| Problem | Check |
| --- | --- |
| Missing tables or admin | Check environment values, then run `scripts.deploy_setup` or redeploy. |
| API returns 503 | Check the binding, database connection, migrations, and backend Runtime Logs. |
| Writes return 403 | Use the app's origin and the required account role. |
| Only one service builds | Use the repository root and the Services framework preset. |
| Missing websocket shim | Try `npx vercel@latest dev -L`. |

Search the response's `x-request-id` in Vercel Runtime Logs to correlate frontend/backend requests. Optional Production Web Analytics requires dashboard enablement; custom bookmark events require Pro or Enterprise.

</details>

See [ARCHITECTURE.md](ARCHITECTURE.md) for implementation details and [customization](ARCHITECTURE.md#customize). Read [AGENTS.md](AGENTS.md) for coding-agent guidance. Before real customer accounts, review the [security requirements](ARCHITECTURE.md#ui-and-extension-boundaries), including email verification, password recovery, and admin MFA.
