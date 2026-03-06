# OpenNext Frontend Deployment

This project deploys the Next.js frontend to AWS Lambda + CloudFront using SST's `Nextjs` component (OpenNext under the hood).

## Files

- `sst.config.ts`: OpenNext infrastructure definition
- `.github/workflows/deploy-opennext.yml`: GitHub Actions deploy workflow (push to `main` + manual trigger)
- `.github/workflows/backfill-geo-buckets.yml`: manual-only Dynamo geo bucket backfill workflow

## Workflow usage

1. Open GitHub Actions.
2. Run `Deploy Web to Lambda (OpenNext)`.
3. Choose:
   - `stage`: `production` (or `preview`)
   - `enable_domain_cutover`: `false` for first deploy

The workflow loads sensitive values from GitHub Secrets:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `APP_JWT_SECRET`
- `GOOGLE_GENERATIVE_AI_API_KEY`

The web app now uses same-domain Next.js route handlers (`/api/...`) for both local and production.

## Geo Bucket Backfill (Manual)

The normal deploy workflow does not run postcard geo backfill anymore.
Run `Backfill Postcard Geo Buckets` only when needed (for example after introducing a new geo bucket field/index or changing bucket degrees).

Recommended flow:

1. Trigger the workflow with `dry_run=true` first.
2. Review the reported number of rows to update.
3. Trigger again with `dry_run=false` to apply changes.

## Domain cutover

After preview validation:

1. Run the workflow again with `enable_domain_cutover=true`.
2. This updates Route53 for `pikmin.askans.app` using the hosted zone `Z07732472U0GRGAK1E05W`.

The config uses `sst.aws.dns({ override: true })` so existing DNS records can be replaced without manual record deletion.
