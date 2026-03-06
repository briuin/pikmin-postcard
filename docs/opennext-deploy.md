# OpenNext Frontend Deployment

This project deploys the Next.js frontend to AWS Lambda + CloudFront using SST's `Nextjs` component (OpenNext under the hood).

## Files

- `sst.config.ts`: OpenNext infrastructure definition
- `.github/workflows/deploy-opennext.yml`: GitHub Actions deploy workflow (push to `main` + manual trigger)

## Workflow usage

1. Open GitHub Actions.
2. Run `Deploy Web to Lambda (OpenNext)`.
3. Choose:
   - `stage`: `production` (or `preview`)
   - `enable_domain_cutover`: `false` for first deploy

The workflow loads sensitive values from SSM:

- `/pikmin-postcard/GOOGLE_CLIENT_ID`
- `/pikmin-postcard/GOOGLE_CLIENT_SECRET`
- `/pikmin-postcard/NEXTAUTH_SECRET`
- `/pikmin-postcard/APP_JWT_SECRET`
- `/pikmin-postcard/GOOGLE_GENERATIVE_AI_API_KEY`

The deployment config also uses:

- `APP_BACKEND_MODE` (recommended: `proxy`)
- `SERVERLESS_API_BASE_URL` (HTTP API base URL)

## Domain cutover

After preview validation:

1. Run the workflow again with `enable_domain_cutover=true`.
2. This updates Route53 for `pikmin.askans.app` using the hosted zone `Z07732472U0GRGAK1E05W`.

The config uses `sst.aws.dns({ override: true })` so existing DNS records can be replaced without manual record deletion.
