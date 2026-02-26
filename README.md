# Pikmin Bloom Postcard

Starter scaffold for a postcard collector app with:
- Next.js + TypeScript
- PostgreSQL + Prisma
- OpenStreetMap map UI via Leaflet
- Gemini image analysis API route (photo -> lat/lon)
- AWS ECS deployment through GitHub Actions

## Project Status
This is a bootstrap build for the MVP foundation. Auth and production storage are placeholders and should be completed before launch.

## Local Setup
1. Copy env template:
   ```bash
   cp .env.example .env
   ```
2. Fill required values in `.env`:
   - `DATABASE_URL`
   - `GOOGLE_GENERATIVE_AI_API_KEY`
3. Install and run:
   ```bash
   npm install
   npx prisma migrate dev --name init
   npm run dev
   ```

## API Endpoints
- `POST /api/location-from-image`
  - multipart form field: `image`
  - returns JSON with `latitude`, `longitude`, `confidence`, `place_guess`
- `GET /api/postcards`
  - returns latest postcards
- `POST /api/postcards`
  - creates a postcard entry

## AWS Deployment (GitHub Actions + ECS)
Workflow: `.github/workflows/deploy.yml`

### 1) Create GitHub Secrets
- `AWS_ROLE_ARN` (IAM role for OIDC assume)

### 2) Create GitHub Variables
- `ECR_REPOSITORY`
- `ECS_CLUSTER`
- `ECS_SERVICE`

### 3) Configure ECS Task Definition
Edit `infra/ecs-task-definition.json`:
- replace account IDs and role ARNs
- update Parameter Store ARNs for `DATABASE_URL` and `GOOGLE_GENERATIVE_AI_API_KEY`

### 4) Push to `main`
The workflow will lint, build, push Docker image to ECR, and deploy ECS service.

## Security Notes
- Never commit cloud/API secrets to git.
- Use GitHub OIDC + IAM role instead of long-lived AWS keys.
- Rotate any key that has been shared in plain text.
