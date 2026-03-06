/// <reference path="./.sst/platform/config.d.ts" />

const DEFAULT_DOMAIN_NAME = "pikmin.askans.app";
const DEFAULT_ROUTE53_ZONE_ID = "Z07732472U0GRGAK1E05W";

function isTrue(value: string | undefined): boolean {
  return String(value || "")
    .trim()
    .toLowerCase() === "true";
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

export default $config({
  app(input) {
    return {
      name: "pikmin-postcard-web",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    const ddbTablePrefix =
      process.env.DDB_TABLE_PREFIX?.trim() || "pikmin-postcard-dev";
    const s3BucketName = requiredEnv("S3_BUCKET_NAME");
    const s3Region = process.env.S3_REGION?.trim() || "us-east-1";
    const s3PublicBaseUrl = process.env.S3_PUBLIC_BASE_URL?.trim() || "";
    const googleClientId = requiredEnv("GOOGLE_CLIENT_ID");
    const googleClientSecret = requiredEnv("GOOGLE_CLIENT_SECRET");
    const appJwtSecret = requiredEnv("APP_JWT_SECRET");
    const geminiApiKey = requiredEnv("GOOGLE_GENERATIVE_AI_API_KEY");
    const geminiModel = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
    const newUserApprovalMode =
      process.env.NEW_USER_APPROVAL_MODE?.trim() || "auto";
    const publicGoogleClientId =
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ||
      googleClientId;

    if (!publicGoogleClientId) {
      throw new Error(
        "Missing public Google client id. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID or GOOGLE_CLIENT_ID."
      );
    }

    const enableDomainCutover = isTrue(process.env.OPENNEXT_ENABLE_DOMAIN);
    const domainName =
      process.env.OPENNEXT_DOMAIN_NAME?.trim() || DEFAULT_DOMAIN_NAME;
    const zoneId =
      process.env.OPENNEXT_ROUTE53_ZONE_ID?.trim() || DEFAULT_ROUTE53_ZONE_ID;

    const ddbPermission = {
      actions: [
        "dynamodb:GetItem",
        "dynamodb:BatchGetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchWriteItem",
      ],
      resources: [
        `arn:aws:dynamodb:*:*:table/${ddbTablePrefix}-*`,
        `arn:aws:dynamodb:*:*:table/${ddbTablePrefix}-*/index/*`,
      ],
    };

    const s3Permission = {
      actions: ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
      resources: [
        `arn:aws:s3:::${s3BucketName}`,
        `arn:aws:s3:::${s3BucketName}/*`,
      ],
    };

    const detectionDlq = new sst.aws.Queue("DetectionDlq");
    const detectionQueue = new sst.aws.Queue("DetectionQueue", {
      visibilityTimeout: "5 minutes",
      dlq: {
        queue: detectionDlq.arn,
        retry: 3,
      },
    });

    detectionQueue.subscribe(
      {
        handler: "lib/location-detection/queue-worker.handler",
        timeout: "5 minutes",
        memory: "1024 MB",
        environment: {
          GOOGLE_GENERATIVE_AI_API_KEY: geminiApiKey,
          GEMINI_MODEL: geminiModel,
          S3_BUCKET_NAME: s3BucketName,
          S3_REGION: s3Region,
          S3_PUBLIC_BASE_URL: s3PublicBaseUrl,
          DDB_TABLE_PREFIX: ddbTablePrefix,
        },
        permissions: [ddbPermission, s3Permission],
      },
      {
        batch: {
          size: 1,
          partialResponses: true,
        },
      }
    );

    const site = new sst.aws.Nextjs("Web", {
      path: ".",
      permissions: [
        ddbPermission,
        s3Permission,
        {
          actions: ["sqs:SendMessage", "sqs:GetQueueAttributes", "sqs:GetQueueUrl"],
          resources: [detectionQueue.arn],
        },
      ],
      domain: enableDomainCutover
        ? {
            name: domainName,
            dns: sst.aws.dns({
              zone: zoneId,
              // Allow replacing the current record during managed cutover.
              override: true,
            }),
          }
        : undefined,
      environment: {
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: publicGoogleClientId,
        GOOGLE_CLIENT_ID: googleClientId,
        GOOGLE_CLIENT_SECRET: googleClientSecret,
        APP_JWT_SECRET: appJwtSecret,
        GOOGLE_GENERATIVE_AI_API_KEY: geminiApiKey,
        GEMINI_MODEL: geminiModel,
        S3_BUCKET_NAME: s3BucketName,
        S3_REGION: s3Region,
        S3_PUBLIC_BASE_URL: s3PublicBaseUrl,
        DDB_TABLE_PREFIX: ddbTablePrefix,
        NEW_USER_APPROVAL_MODE: newUserApprovalMode,
        DETECTION_QUEUE_URL: detectionQueue.url,
      },
    });

    return {
      webUrl: site.url,
      detectionQueueUrl: detectionQueue.url,
      detectionDlqUrl: detectionDlq.url,
      domainConfigured: enableDomainCutover ? "true" : "false",
      domainName: enableDomainCutover ? domainName : "not-configured",
    };
  },
});
