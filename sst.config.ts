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
    const serverApiBaseUrl =
      process.env.SERVERLESS_API_BASE_URL?.trim() || "";
    const appBackendMode =
      process.env.APP_BACKEND_MODE?.trim() ||
      (serverApiBaseUrl ? "proxy" : "local");
    const publicGoogleClientId =
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ||
      process.env.GOOGLE_CLIENT_ID?.trim() ||
      "";

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

    const site = new sst.aws.Nextjs("Web", {
      path: ".",
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
        SERVERLESS_API_BASE_URL: serverApiBaseUrl,
        APP_BACKEND_MODE: appBackendMode,
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: publicGoogleClientId,
        GOOGLE_CLIENT_ID: requiredEnv("GOOGLE_CLIENT_ID"),
        GOOGLE_CLIENT_SECRET: requiredEnv("GOOGLE_CLIENT_SECRET"),
        NEXTAUTH_URL: process.env.NEXTAUTH_URL?.trim() || `https://${domainName}`,
        AUTH_URL: process.env.AUTH_URL?.trim() || `https://${domainName}`,
        NEXTAUTH_SECRET: requiredEnv("NEXTAUTH_SECRET"),
        APP_JWT_SECRET: requiredEnv("APP_JWT_SECRET"),
        GOOGLE_GENERATIVE_AI_API_KEY: requiredEnv("GOOGLE_GENERATIVE_AI_API_KEY"),
        GEMINI_MODEL: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
        S3_BUCKET_NAME: requiredEnv("S3_BUCKET_NAME"),
        S3_REGION: process.env.S3_REGION?.trim() || "us-east-1",
        S3_PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL?.trim() || "",
        DDB_TABLE_PREFIX: process.env.DDB_TABLE_PREFIX?.trim() || "pikmin-postcard",
        NEW_USER_APPROVAL_MODE:
          process.env.NEW_USER_APPROVAL_MODE?.trim() || "auto",
      },
    });

    return {
      webUrl: site.url,
      domainConfigured: enableDomainCutover ? "true" : "false",
      domainName: enableDomainCutover ? domainName : "not-configured",
    };
  },
});
