# Pikmin Bloom Postcard

Starter scaffold for a postcard collector app with:
- Next.js + TypeScript
- PostgreSQL + Prisma
- Google-only login via NextAuth
- OpenStreetMap map UI via Leaflet
- Gemini image analysis API route (photo -> lat/lon)
- AWS ECS deployment through GitHub Actions

## Project Status
This is a bootstrap build for the MVP foundation. Users must sign in with Google, and location permission is required before postcard actions.

## Local Setup
1. Copy env template:
   ```bash
   cp .env.example .env
   ```
2. Fill required values in `.env`:
   - `DATABASE_URL`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL`
   - `GOOGLE_GENERATIVE_AI_API_KEY`
   - `S3_BUCKET_NAME`
3. Configure Google OAuth redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://pikmin.askans.app/api/auth/callback/google`
4. Install and run:
   ```bash
   npm install
   npx prisma migrate dev --name init
   npm run dev
   ```

## API Endpoints
- `GET|POST /api/auth/[...nextauth]`
  - NextAuth route handlers (Google provider only)
- `POST /api/location-from-image`
  - multipart form field: `image`
  - returns JSON with `latitude`, `longitude`, `confidence`, `place_guess`
  - requires authenticated session
- `POST /api/upload-image`
  - multipart form field: `image`
  - uploads to S3 and returns `imageUrl`
  - requires authenticated session
- `GET /api/postcards`
  - returns current user postcards
  - requires authenticated session
- `POST /api/postcards`
  - creates a postcard entry for current user
  - requires authenticated session

## Access Rules
- Only Google account login is allowed.
- Browser geolocation permission is required before location detection and postcard save actions.

## AWS Deployment (GitHub Actions + ECS)
Workflow: `.github/workflows/deploy.yml`

### 1) Create GitHub Secrets
- `AWS_ROLE_ARN` (IAM role for OIDC assume)

### 2) Configure ECS Task Definition
Edit `infra/ecs-task-definition.json`:
- replace account IDs and role ARNs
- update Parameter Store ARNs for `DATABASE_URL` and `GOOGLE_GENERATIVE_AI_API_KEY`
- add Parameter Store ARNs for `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `NEXTAUTH_SECRET`
- set `S3_BUCKET_NAME` (and optional `S3_PUBLIC_BASE_URL`) in container environment

### 3) Push to `main`
The workflow will lint, build, push Docker image to ECR, and deploy ECS service.

## Security Notes
- Never commit cloud/API secrets to git.
- Use GitHub OIDC + IAM role instead of long-lived AWS keys.
- Rotate any key that has been shared in plain text.
