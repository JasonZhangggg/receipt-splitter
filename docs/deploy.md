# Deploy to Cloudflare

Every push to `main` that passes CI deploys to production. `.github/workflows/deploy.yml` builds `dist/` and runs `wrangler deploy` against `wrangler.jsonc`.

Production is the Worker `app` on the account subdomain `splitwith`, so the address is `app.splitwith.workers.dev`.

## Set up once

1. Log in to the [Cloudflare dashboard](https://dash.cloudflare.com). Copy your account ID from the Workers & Pages overview.
2. Create an API token (My Profile, API Tokens, Create Token) from the "Edit Cloudflare Workers" template.
3. In GitHub, open Settings, Secrets and variables, Actions. Add these repository secrets.
	- `CLOUDFLARE_API_TOKEN` holds the token from step 2.
	- `CLOUDFLARE_ACCOUNT_ID` holds the account ID from step 1.
4. Optional. Under Settings, Environments, open `production` and add required reviewers or a branch rule. Every deploy job uses that environment.

The Worker needs two secrets. Set each once with Wrangler, which prompts for the value and stores it on the Worker without a deploy.

- `SPLIT_ID_SECRET` signs every new Split id (ADR 0009). Without it, `POST /api/splits` answers 503 and existing Splits keep working. Generate a value and paste it at the prompt. Never change it afterwards, because every link signed with the old value stops opening.

	```sh
	openssl rand -base64 32
	npx wrangler secret put SPLIT_ID_SECRET --name app
	```

- `OPENROUTER_API_KEY` reads receipts on the server (ADR 0008). Without it, scans fall back to the on-device reading.

	```sh
	npx wrangler secret put OPENROUTER_API_KEY --name app
	```

To run the first deploy, open Actions, select Deploy, and choose Run workflow on `main`.

## Remove the Turnstile setup

The app used Cloudflare Turnstile until 2026-10-01. Nothing reads its settings now, so you can delete them.

1. In GitHub, open Settings, Secrets and variables, Actions, Variables. Delete `EXPO_PUBLIC_TURNSTILE_SITE_KEY` and `ALLOWED_HOSTNAMES`.
2. Delete the Worker secret. Wrangler deploys a new version without it.

	```sh
	npx wrangler secret delete TURNSTILE_SECRET_KEY --name app
	```

3. In the Cloudflare dashboard, open Turnstile and delete the widget for `app.splitwith.workers.dev`.

## Rename the Worker

The `name` in `wrangler.jsonc` is the Worker's identity and the first label of its address. If you change it after the first deploy, the next deploy creates a new Worker and leaves the old one running. Stored Splits stay on the old Worker, so the new one starts empty.

## How a deploy happens

1. A commit lands on `main` and the CI workflow runs.
2. When CI finishes, GitHub starts the Deploy workflow. It continues only if CI succeeded on a `push` event. Pull request runs never deploy.
3. The job checks out the exact commit CI tested, runs `npm ci` and `npm run build`, then deploys with `cloudflare/wrangler-action@v4`.
4. Before it builds, the job compares that commit with the current tip of `main`. If `main` has moved on, the job skips the build and the deploy with a notice, because the newer commit's CI run deploys instead.
5. Deploys run one at a time. A deploy that is already running is never cancelled.

## Redeploy manually

Open Actions, select Deploy, and choose Run workflow on `main`. Use this after you change a repository secret, because changing one does not trigger a deploy. A manual run deploys the tip of `main` and skips the CI check, so confirm that CI passed on that commit first.

## Roll back

List recent versions, then roll back to one.

```sh
npx wrangler versions list
npx wrangler rollback <VERSION_ID>
```

Without a version ID, `wrangler rollback` returns to the version uploaded before the latest one. The rollback becomes the active deployment at once. The next push to `main` deploys the newest code again, so revert the bad commit as well.
