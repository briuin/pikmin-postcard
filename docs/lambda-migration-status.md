# Lambda Migration Status

This project is being migrated from `ECS + RDS` to `Lambda + API Gateway + DynamoDB + S3` using a no-downtime strangler approach.

## What is already done

- Account-wide budget guard is configured:
  - Monthly budget: `$50` (including tax)
  - Trigger: `ACTUAL > 100%`
  - Action path: `AWS Budget -> SNS -> Lambda`
  - Guard Lambda scales ECS service to `0`, stops RDS, and can disable Lambda concurrency by prefix.
- DynamoDB provisioning scripts are added.
- Prisma/PostgreSQL -> DynamoDB migration scripts are added.
- Initial data copy from PostgreSQL to DynamoDB is supported and verified by counts.
- New serverless API Lambda package is added with core endpoints:
  - `GET /health`
  - `GET /postcards`
  - `GET /postcards/{id}`
  - `POST /postcards`
  - `POST /postcards/{id}/feedback`
  - `POST /upload-image`
- OpenNext (SST) deployment scaffold is added for Next.js frontend on Lambda + CloudFront:
  - `sst.config.ts`
  - `.github/workflows/deploy-opennext.yml`
  - domain cutover toggle via `OPENNEXT_ENABLE_DOMAIN`

## Commands

```bash
npm run ddb:provision -- --region us-east-1 --prefix pikmin-postcard
npm run ddb:migrate -- --region us-east-1 --prefix pikmin-postcard
npm run ddb:verify -- --region us-east-1 --prefix pikmin-postcard
./scripts/deploy-serverless-api.sh
npx sst deploy --stage production
```

## Next cutover work (required for full migration)

1. Deploy OpenNext frontend to a preview stage and verify:
   - login
   - explore/create/dashboard/admin routes
   - image upload and AI flow
2. Cut DNS to OpenNext (`OPENNEXT_ENABLE_DOMAIN=true`) when preview is verified.
3. Move all remaining routes to Lambda handlers:
   - auth/session bridging
   - admin routes
   - report workflow routes
   - profile/feedback routes
   - AI detection queue routes
4. Replace Prisma repository usage in app runtime with Dynamo-backed services.
5. Run dual-write window (RDS + Dynamo) and validate parity.
6. Cut read path to Dynamo-only.
7. Decommission ECS + ALB + RDS after verification.

## Notes

- Current Lambda API intentionally supports core postcard flow first.
- Existing production app remains available during migration.
