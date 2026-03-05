#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

FUNCTION_NAME="pikmin-postcard-serverless-api"
ROLE_NAME="pikmin-postcard-serverless-api-role"
API_NAME="pikmin-postcard-http-api"

DDB_TABLE_PREFIX="${DDB_TABLE_PREFIX:-pikmin-postcard}"
S3_BUCKET_NAME="${S3_BUCKET_NAME:-}"
S3_REGION="${S3_REGION:-$REGION}"
S3_PUBLIC_BASE_URL="${S3_PUBLIC_BASE_URL:-}"
GOOGLE_GENERATIVE_AI_API_KEY="${GOOGLE_GENERATIVE_AI_API_KEY:-}"
GEMINI_MODEL="${GEMINI_MODEL:-}"
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-${NEXT_PUBLIC_GOOGLE_CLIENT_ID:-}}"
APP_JWT_SECRET="${APP_JWT_SECRET:-}"
NEW_USER_APPROVAL_MODE="${NEW_USER_APPROVAL_MODE:-auto}"
ADMIN_EMAILS="${ADMIN_EMAILS:-}"

if [[ -z "$S3_BUCKET_NAME" ]]; then
  echo "S3_BUCKET_NAME is required"
  exit 1
fi
if [[ -z "$GOOGLE_CLIENT_ID" ]]; then
  echo "GOOGLE_CLIENT_ID (or NEXT_PUBLIC_GOOGLE_CLIENT_ID) is required"
  exit 1
fi
if [[ -z "$APP_JWT_SECRET" ]]; then
  echo "APP_JWT_SECRET is required"
  exit 1
fi

LAMBDA_ENV="Variables={DDB_TABLE_PREFIX=${DDB_TABLE_PREFIX},S3_BUCKET_NAME=${S3_BUCKET_NAME},S3_REGION=${S3_REGION},GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID},APP_JWT_SECRET=${APP_JWT_SECRET},NEW_USER_APPROVAL_MODE=${NEW_USER_APPROVAL_MODE}"
if [[ -n "$S3_PUBLIC_BASE_URL" ]]; then
  LAMBDA_ENV+=",S3_PUBLIC_BASE_URL=${S3_PUBLIC_BASE_URL}"
fi
if [[ -n "$GOOGLE_GENERATIVE_AI_API_KEY" ]]; then
  LAMBDA_ENV+=",GOOGLE_GENERATIVE_AI_API_KEY=${GOOGLE_GENERATIVE_AI_API_KEY}"
fi
if [[ -n "$GEMINI_MODEL" ]]; then
  LAMBDA_ENV+=",GEMINI_MODEL=${GEMINI_MODEL}"
fi
if [[ -n "$ADMIN_EMAILS" ]]; then
  LAMBDA_ENV+=",ADMIN_EMAILS=${ADMIN_EMAILS}"
fi
LAMBDA_ENV+="}"

mkdir -p /tmp/pikmin-serverless-api
cp serverless/api/index.mjs /tmp/pikmin-serverless-api/index.mjs
(
  cd /tmp/pikmin-serverless-api
  zip -q -f function.zip index.mjs || zip -q function.zip index.mjs
)

if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  cat > /tmp/pikmin-serverless-api-trust.json <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {"Service": "lambda.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }
  ]
}
JSON
  aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document file:///tmp/pikmin-serverless-api-trust.json >/dev/null
fi

cat > /tmp/pikmin-serverless-api-policy.json <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:BatchGetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchWriteItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/${DDB_TABLE_PREFIX}-*",
        "arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/${DDB_TABLE_PREFIX}-*/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::${S3_BUCKET_NAME}",
        "arn:aws:s3:::${S3_BUCKET_NAME}/*"
      ]
    }
  ]
}
JSON
aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name pikmin-postcard-serverless-api-inline --policy-document file:///tmp/pikmin-serverless-api-policy.json >/dev/null
ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query Role.Arn --output text)"

if aws lambda get-function --region "$REGION" --function-name "$FUNCTION_NAME" >/dev/null 2>&1; then
  aws lambda update-function-code --region "$REGION" --function-name "$FUNCTION_NAME" --zip-file fileb:///tmp/pikmin-serverless-api/function.zip >/dev/null
  aws lambda wait function-updated --region "$REGION" --function-name "$FUNCTION_NAME"
  aws lambda update-function-configuration \
    --region "$REGION" \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs22.x \
    --role "$ROLE_ARN" \
    --handler index.handler \
    --timeout 30 \
    --memory-size 512 \
    --environment "$LAMBDA_ENV" >/dev/null
  aws lambda wait function-updated --region "$REGION" --function-name "$FUNCTION_NAME"
else
  created=false
  for i in 1 2 3 4 5; do
    if aws lambda create-function \
      --region "$REGION" \
      --function-name "$FUNCTION_NAME" \
      --runtime nodejs22.x \
      --role "$ROLE_ARN" \
      --handler index.handler \
      --zip-file fileb:///tmp/pikmin-serverless-api/function.zip \
      --timeout 30 \
      --memory-size 512 \
      --environment "$LAMBDA_ENV" >/dev/null; then
      created=true
      break
    fi
    sleep 6
  done
  if [[ "$created" != "true" ]]; then
    echo "Failed to create Lambda function: $FUNCTION_NAME"
    exit 1
  fi
  aws lambda wait function-active --region "$REGION" --function-name "$FUNCTION_NAME"
fi

LAMBDA_ARN="$(aws lambda get-function --region "$REGION" --function-name "$FUNCTION_NAME" --query Configuration.FunctionArn --output text)"

API_ID="$(aws apigatewayv2 get-apis --region "$REGION" --query "Items[?Name=='${API_NAME}'].ApiId | [0]" --output text)"
if [[ -z "$API_ID" || "$API_ID" == "None" ]]; then
  API_ID="$(aws apigatewayv2 create-api --region "$REGION" --name "$API_NAME" --protocol-type HTTP --target "$LAMBDA_ARN" --query ApiId --output text)"
fi

INTEGRATION_ID="$(aws apigatewayv2 get-integrations --region "$REGION" --api-id "$API_ID" --query "Items[?IntegrationUri=='${LAMBDA_ARN}'].IntegrationId | [0]" --output text)"
if [[ -z "$INTEGRATION_ID" || "$INTEGRATION_ID" == "None" ]]; then
  INTEGRATION_ID="$(aws apigatewayv2 create-integration --region "$REGION" --api-id "$API_ID" --integration-type AWS_PROXY --integration-uri "$LAMBDA_ARN" --payload-format-version 2.0 --query IntegrationId --output text)"
fi

DEFAULT_ROUTE_ID="$(aws apigatewayv2 get-routes --region "$REGION" --api-id "$API_ID" --query 'Items[?RouteKey==`$default`].RouteId | [0]' --output text)"
if [[ -z "$DEFAULT_ROUTE_ID" || "$DEFAULT_ROUTE_ID" == "None" ]]; then
  aws apigatewayv2 create-route --region "$REGION" --api-id "$API_ID" --route-key '$default' --target "integrations/$INTEGRATION_ID" >/dev/null
else
  aws apigatewayv2 update-route --region "$REGION" --api-id "$API_ID" --route-id "$DEFAULT_ROUTE_ID" --target "integrations/$INTEGRATION_ID" >/dev/null
fi

STAGE_EXISTS="$(aws apigatewayv2 get-stages --region "$REGION" --api-id "$API_ID" --query 'Items[?StageName==`$default`].StageName | [0]' --output text)"
if [[ -z "$STAGE_EXISTS" || "$STAGE_EXISTS" == "None" ]]; then
  aws apigatewayv2 create-stage --region "$REGION" --api-id "$API_ID" --stage-name '$default' --auto-deploy >/dev/null
else
  aws apigatewayv2 update-stage --region "$REGION" --api-id "$API_ID" --stage-name '$default' --auto-deploy >/dev/null
fi

PERM_SID="AllowApiGatewayInvoke-${API_ID}"
aws lambda add-permission \
  --region "$REGION" \
  --function-name "$FUNCTION_NAME" \
  --statement-id "$PERM_SID" \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*/*" >/dev/null 2>&1 || true

API_ENDPOINT="$(aws apigatewayv2 get-api --region "$REGION" --api-id "$API_ID" --query ApiEndpoint --output text)"

echo "FUNCTION_NAME=$FUNCTION_NAME"
echo "LAMBDA_ARN=$LAMBDA_ARN"
echo "API_ID=$API_ID"
echo "API_ENDPOINT=$API_ENDPOINT"
echo "DDB_TABLE_PREFIX=$DDB_TABLE_PREFIX"
