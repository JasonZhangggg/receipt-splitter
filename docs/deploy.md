# Deploy to Cloudflare

Every push to `main` that passes CI deploys to production. `.github/workflows/deploy.yml` builds `dist/` and runs `wrangler deploy` against `wrangler.jsonc`.

## Set up once

1. Log in to the [Cloudflare dashboard](https://dash.cloudflare.com). Copy your account ID from the Workers & Pages overview.
2. Create a Turnstile widget (Turnstile, then Add widget). Add the production hostnames and copy the site key and the secret key.
3. Create an API token (My Profile, API Tokens, Create Token) from the "Edit Cloudflare Workers" template.
4. In GitHub, open Settings, Secrets and variables, Actions. Add these repository secrets.
	- `CLOUDFLARE_API_TOKEN` holds the token from step 3.
	- `CLOUDFLARE_ACCOUNT_ID` holds the account ID from step 1.
5. On the same page, add these repository variables. Use repository scope, not environment scope, because the workflow reads them in a job-level condition that cannot see environment variables. Deploys start once both are set. Until then the workflow skips the job, and the run stays green.
	- `EXPO_PUBLIC_TURNSTILE_SITE_KEY` holds the Turnstile site key.
	- `ALLOWED_HOSTNAMES` holds the hostnames that serve the app, in the format the Worker reads.
6. Optional. Under Settings, Environments, open `production` and add required reviewers or a branch rule. Every deploy job uses that environment.

## Run the first deploy

1. Open Actions, select Deploy, and choose Run workflow on `main`.
2. When the run succeeds, log in from your machine with `npx wrangler login`.
3. Store the Turnstile secret key on the Worker. Wrangler prompts for the value, so it never lands in your shell history.

	```sh
	npx wrangler secret put TURNSTILE_SECRET_KEY
	```

`wrangler secret put` creates a new version and deploys it at once. Run it again whenever you rotate the key.

## How a deploy happens

1. A commit lands on `main` and the CI workflow runs.
2. When CI finishes, GitHub starts the Deploy workflow. It continues only if CI succeeded on a `push` event. Pull request runs never deploy.
3. The job checks out the exact commit CI tested, runs `npm ci` and `npm run build`, then deploys with `cloudflare/wrangler-action@v4`.
4. Before it builds, the job compares that commit with the current tip of `main`. If `main` has moved on, the job skips the build and the deploy with a notice, because the newer commit's CI run deploys instead.
5. Deploys run one at a time. A deploy that is already running is never cancelled.

## Redeploy manually

Open Actions, select Deploy, and choose Run workflow on `main`. Use this after you change a variable or secret, because changing one does not trigger a deploy. A manual run deploys the tip of `main` and skips the CI check, so confirm that CI passed on that commit first.

## Roll back

List recent versions, then roll back to one.

```sh
npx wrangler versions list
npx wrangler rollback <VERSION_ID>
```

Without a version ID, `wrangler rollback` returns to the version uploaded before the latest one. The rollback becomes the active deployment at once. The next push to `main` deploys the newest code again, so revert the bad commit as well.
