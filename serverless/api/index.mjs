import crypto from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchGetCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REGION = process.env.AWS_REGION || "us-east-1";
const TABLE_PREFIX = process.env.DDB_TABLE_PREFIX || "pikmin-postcard";
const S3_BUCKET = process.env.S3_BUCKET_NAME || "";
const S3_REGION = process.env.S3_REGION || REGION;
const S3_PUBLIC_BASE_URL = process.env.S3_PUBLIC_BASE_URL || "";
const GOOGLE_GENERATIVE_AI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const APP_JWT_SECRET = process.env.APP_JWT_SECRET || "";
const NEW_USER_APPROVAL_MODE = String(process.env.NEW_USER_APPROVAL_MODE || "auto")
  .trim()
  .toLowerCase();
const DEFAULT_ADMIN_EMAILS = ["dreamingdexiaoxiaohao@gmail.com"];
const ADMIN_EMAILS = [
  ...DEFAULT_ADMIN_EMAILS,
  ...String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean),
];

const TABLES = {
  users: `${TABLE_PREFIX}-users`,
  postcards: `${TABLE_PREFIX}-postcards`,
  detectionJobs: `${TABLE_PREFIX}-detection-jobs`,
  postcardFeedback: `${TABLE_PREFIX}-postcard-feedback`,
  postcardReportCases: `${TABLE_PREFIX}-postcard-report-cases`,
  postcardReports: `${TABLE_PREFIX}-postcard-reports`,
  feedbackMessages: `${TABLE_PREFIX}-feedback-messages`,
  userActionLogs: `${TABLE_PREFIX}-user-action-logs`,
};

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({ region: S3_REGION });

const CORS_HEADERS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type,authorization,x-user-id,x-user-email",
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function roleForEmail(email) {
  return ADMIN_EMAILS.includes(normalizeEmail(email)) ? "ADMIN" : "MEMBER";
}

function defaultApprovalStatusForRole(role) {
  if (role === "ADMIN") return "APPROVED";
  return NEW_USER_APPROVAL_MODE === "pending" ? "PENDING" : "APPROVED";
}

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function parseJwtParts(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format");
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const header = JSON.parse(fromBase64Url(encodedHeader).toString("utf8"));
  const payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8"));
  const signature = fromBase64Url(encodedSignature);

  return {
    header,
    payload,
    signingInput,
    signature,
  };
}

function createAppJwt(payload, options = {}) {
  if (!APP_JWT_SECRET) {
    throw new Error("APP_JWT_SECRET is not configured");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresInSeconds =
    typeof options.expiresInSeconds === "number" && options.expiresInSeconds > 0
      ? options.expiresInSeconds
      : 60 * 60 * 24 * 7;

  const header = { alg: "HS256", typ: "JWT" };
  const body = {
    iat: nowSeconds,
    exp: nowSeconds + expiresInSeconds,
    ...payload,
  };

  const encodedHeader = toBase64Url(Buffer.from(JSON.stringify(header)));
  const encodedPayload = toBase64Url(Buffer.from(JSON.stringify(body)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac("sha256", APP_JWT_SECRET).update(signingInput).digest();
  const encodedSignature = toBase64Url(signature);
  return `${signingInput}.${encodedSignature}`;
}

function verifyAppJwt(token) {
  if (!APP_JWT_SECRET) {
    throw new Error("APP_JWT_SECRET is not configured");
  }
  const { header, payload, signingInput, signature } = parseJwtParts(token);
  if (header?.alg !== "HS256") {
    throw new Error("Unsupported token algorithm");
  }
  const expected = crypto.createHmac("sha256", APP_JWT_SECRET).update(signingInput).digest();
  if (expected.length !== signature.length || !crypto.timingSafeEqual(expected, signature)) {
    throw new Error("Invalid token signature");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) {
    throw new Error("Token expired");
  }
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new Error("Token subject is missing");
  }

  return payload;
}

function getBearerToken(event) {
  const header = getHeader(event.headers, "authorization");
  if (!header) return null;
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

let googleJwksCache = {
  fetchedAtMs: 0,
  keys: [],
};

async function getGoogleJwks() {
  const now = Date.now();
  if (googleJwksCache.keys.length > 0 && now - googleJwksCache.fetchedAtMs < 60 * 60 * 1000) {
    return googleJwksCache.keys;
  }

  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch Google JWKs");
  }
  const payload = await response.json();
  const keys = Array.isArray(payload?.keys) ? payload.keys : [];
  if (!keys.length) {
    throw new Error("Google JWK set is empty");
  }

  googleJwksCache = {
    fetchedAtMs: now,
    keys,
  };
  return keys;
}

async function verifyGoogleIdToken(idToken) {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID is not configured");
  }

  const { header, payload, signingInput, signature } = parseJwtParts(idToken);
  if (header?.alg !== "RS256" || !header?.kid) {
    throw new Error("Unsupported Google token header");
  }

  const jwks = await getGoogleJwks();
  const jwk = jwks.find((item) => item.kid === header.kid);
  if (!jwk) {
    throw new Error("Google signing key was not found");
  }

  const keyObject = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const verified = crypto.verify("RSA-SHA256", Buffer.from(signingInput), keyObject, signature);
  if (!verified) {
    throw new Error("Google token signature is invalid");
  }

  const issuer = String(payload.iss || "");
  if (issuer !== "https://accounts.google.com" && issuer !== "accounts.google.com") {
    throw new Error("Google token issuer is invalid");
  }

  const audienceValues = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audienceValues.map(String).includes(GOOGLE_CLIENT_ID)) {
    throw new Error("Google token audience is invalid");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) {
    throw new Error("Google token expired");
  }

  if (!payload.email || payload.email_verified === false) {
    throw new Error("Google account email is not verified");
  }

  return {
    googleSub: String(payload.sub || ""),
    email: normalizeEmail(payload.email),
    name: payload.name ? String(payload.name) : null,
  };
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getHeader(headers, key) {
  if (!headers) return null;
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

function parseNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseBooleanParam(value, defaultValue = false) {
  if (value == null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return defaultValue;
}

function parseIntegerParam(value, fallback, min, max) {
  const parsed = parseInt(String(value ?? ""), 10);
  const effective = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(Math.max(effective, min), max);
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function maskEmail(email) {
  const value = String(email || "").trim();
  const at = value.indexOf("@");
  if (at <= 0) return "unknown uploader";
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const visible = local.length <= 2 ? local : local.slice(0, 2);
  return `${visible}***@${domain}`;
}

function uploaderName(user) {
  if (!user) return "unknown uploader";
  const displayName = String(user.displayName || "").trim();
  if (displayName) return displayName;
  return maskEmail(user.email);
}

async function getUserById(userId) {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLES.users,
      Key: { id: userId },
    })
  );
  return res.Item || null;
}

function roleRank(role) {
  const value = String(role || "").toUpperCase();
  if (value === "ADMIN") return 3;
  if (value === "MANAGER") return 2;
  return 1;
}

function isManagerOrAbove(role) {
  return roleRank(role) >= 2;
}

function isAdmin(role) {
  return String(role || "").toUpperCase() === "ADMIN";
}

async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.users,
      IndexName: "email-index",
      KeyConditionExpression: "#email = :email",
      ExpressionAttributeNames: { "#email": "email" },
      ExpressionAttributeValues: { ":email": normalized },
      Limit: 1,
    })
  );

  return result.Items?.[0] || null;
}

async function ensureUserByEmail({ email, name = null }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("User email is required");
  }

  const defaultRole = roleForEmail(normalizedEmail);
  const now = nowIso();
  let user = await findUserByEmail(normalizedEmail);

  if (!user) {
    user = {
      id: `usr_${crypto.randomUUID().replace(/-/g, "")}`,
      email: normalizedEmail,
      displayName: name ? String(name).trim() || null : null,
      role: defaultRole,
      approvalStatus: defaultApprovalStatusForRole(defaultRole),
      canCreatePostcard: true,
      canSubmitDetection: true,
      canVote: true,
      createdAt: now,
      updatedAt: now,
    };
    await ddb.send(new PutCommand({ TableName: TABLES.users, Item: user }));
    return user;
  }

  const shouldForceAdmin = defaultRole === "ADMIN" && String(user.role || "") !== "ADMIN";
  const normalizedDisplayName = name ? String(name).trim() || null : null;
  const shouldSetDisplayName =
    normalizedDisplayName && !String(user.displayName || "").trim();
  const shouldNormalizeEmail = normalizeEmail(user.email) !== normalizedEmail;
  const shouldSetPermissions =
    typeof user.canCreatePostcard !== "boolean" ||
    typeof user.canSubmitDetection !== "boolean" ||
    typeof user.canVote !== "boolean";

  if (shouldForceAdmin || shouldSetDisplayName || shouldNormalizeEmail || shouldSetPermissions) {
    const updated = {
      ...user,
      email: normalizedEmail,
      displayName: shouldSetDisplayName ? normalizedDisplayName : user.displayName || null,
      role: shouldForceAdmin ? "ADMIN" : user.role || "MEMBER",
      approvalStatus: shouldForceAdmin
        ? "APPROVED"
        : user.approvalStatus || defaultApprovalStatusForRole(String(user.role || "MEMBER")),
      canCreatePostcard:
        typeof user.canCreatePostcard === "boolean" ? user.canCreatePostcard : true,
      canSubmitDetection:
        typeof user.canSubmitDetection === "boolean" ? user.canSubmitDetection : true,
      canVote: typeof user.canVote === "boolean" ? user.canVote : true,
      updatedAt: now,
    };
    await ddb.send(new PutCommand({ TableName: TABLES.users, Item: updated }));
    return updated;
  }

  return user;
}

function toAuthUserResponse(user) {
  return {
    id: String(user.id),
    email: normalizeEmail(user.email),
    displayName: user.displayName ? String(user.displayName) : null,
    role: String(user.role || "MEMBER").toUpperCase(),
    approvalStatus: String(user.approvalStatus || "PENDING").toUpperCase(),
  };
}

function createAuthTokenForUser(user) {
  const authUser = toAuthUserResponse(user);
  return createAppJwt({
    sub: authUser.id,
    email: authUser.email,
    name: authUser.displayName,
    role: authUser.role,
    approvalStatus: authUser.approvalStatus,
  });
}

async function requireAuthenticatedUser(event) {
  const bearerToken = getBearerToken(event);
  if (!bearerToken) {
    return {
      ok: false,
      response: response(401, { error: "Missing Authorization bearer token." }),
    };
  }

  let payload;
  try {
    payload = verifyAppJwt(bearerToken);
  } catch (error) {
    return {
      ok: false,
      response: response(401, {
        error: "Invalid bearer token.",
        details: error instanceof Error ? error.message : String(error),
      }),
    };
  }

  const user = await getUserById(String(payload.sub));
  if (!user) {
    return {
      ok: false,
      response: response(401, { error: "Authenticated user no longer exists." }),
    };
  }

  return { ok: true, user };
}

async function getViewerUserId(event) {
  const bearerToken = getBearerToken(event);
  if (!bearerToken) return null;

  try {
    const payload = verifyAppJwt(bearerToken);
    const user = await getUserById(String(payload.sub));
    return user ? String(user.id) : null;
  } catch {
    return null;
  }
}

async function requireManagerUser(event) {
  const auth = await requireAuthenticatedUser(event);
  if (!auth.ok) return auth;
  if (!isManagerOrAbove(auth.user.role)) {
    return {
      ok: false,
      response: response(403, { error: "Manager role or above is required." }),
    };
  }
  return auth;
}

async function requireAdminUser(event) {
  const auth = await requireAuthenticatedUser(event);
  if (!auth.ok) return auth;
  if (!isAdmin(auth.user.role)) {
    return {
      ok: false,
      response: response(403, { error: "Admin role is required." }),
    };
  }
  return auth;
}

async function recordUserAction(event, userId, action, metadata = null) {
  if (!userId) return;
  try {
    const xf = getHeader(event.headers, "x-forwarded-for") || "";
    const ipAddress = xf.split(",")[0]?.trim() || null;
    const userAgent = getHeader(event.headers, "user-agent") || null;
    const method = event?.requestContext?.http?.method || "GET";
    const path = event?.rawPath || "/";

    await ddb.send(
      new PutCommand({
        TableName: TABLES.userActionLogs,
        Item: {
          id: `ual_${crypto.randomUUID().replace(/-/g, "")}`,
          userId,
          action,
          method,
          path,
          ipAddress,
          userAgent,
          metadata,
          createdAt: nowIso(),
        },
      })
    );
  } catch (error) {
    console.error("recordUserAction failed", error);
  }
}

async function batchGetByIds(tableName, ids) {
  const unique = Array.from(new Set(ids.filter(Boolean).map((id) => String(id))));
  if (unique.length === 0) return [];

  const result = [];
  for (const group of chunk(unique, 100)) {
    let requestItems = {
      [tableName]: {
        Keys: group.map((id) => ({ id })),
      },
    };

    let retries = 0;
    while (requestItems && Object.keys(requestItems).length > 0) {
      const res = await ddb.send(new BatchGetCommand({ RequestItems: requestItems }));
      const rows = res.Responses?.[tableName] || [];
      result.push(...rows);

      requestItems = res.UnprocessedKeys || {};
      if (Object.keys(requestItems).length > 0) {
        retries += 1;
        if (retries > 8) break;
        await new Promise((resolve) => setTimeout(resolve, 80 * retries));
      }
    }
  }

  return result;
}

async function queryAllByIndex({
  tableName,
  indexName,
  keyExpression,
  attrNames,
  attrValues,
  scanIndexForward = true,
  limit,
}) {
  const items = [];
  let lastKey;

  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: indexName,
        KeyConditionExpression: keyExpression,
        ExpressionAttributeNames: attrNames,
        ExpressionAttributeValues: attrValues,
        ScanIndexForward: scanIndexForward,
        ExclusiveStartKey: lastKey,
      })
    );

    if (res.Items) items.push(...res.Items);
    lastKey = res.LastEvaluatedKey;

    if (limit && items.length >= limit) {
      return items.slice(0, limit);
    }
  } while (lastKey);

  return items;
}

async function getViewerFeedbackMap(viewerUserId, postcards) {
  const map = new Map();
  if (!viewerUserId || postcards.length === 0) {
    return map;
  }

  const postcardById = new Map(postcards.map((p) => [String(p.id), p]));
  const postcardIds = new Set(postcards.map((p) => String(p.id)));

  const feedbackRows = await queryAllByIndex({
    tableName: TABLES.postcardFeedback,
    indexName: "userId-createdAt-index",
    keyExpression: "#u = :u",
    attrNames: { "#u": "userId" },
    attrValues: { ":u": viewerUserId },
    scanIndexForward: false,
  });

  for (const row of feedbackRows) {
    const postcardId = String(row.postcardId || "");
    if (!postcardIds.has(postcardId)) continue;

    const current =
      map.get(postcardId) ||
      {
        liked: false,
        disliked: false,
        reportedWrongLocation: false,
        favorited: false,
        collected: false,
      };

    const action = String(row.action || "").toUpperCase();
    if (action === "LIKE") current.liked = true;
    if (action === "DISLIKE") current.disliked = true;
    if (action === "FAVORITE") current.favorited = true;
    if (action === "COLLECTED") current.collected = true;
    if (action === "REPORT_WRONG_LOCATION") current.reportedWrongLocation = true;
    map.set(postcardId, current);
  }

  const reports = await queryAllByIndex({
    tableName: TABLES.postcardReports,
    indexName: "reporterUserId-createdAt-index",
    keyExpression: "#u = :u",
    attrNames: { "#u": "reporterUserId" },
    attrValues: { ":u": viewerUserId },
    scanIndexForward: false,
  });

  for (const report of reports) {
    const postcardId = String(report.postcardId || "");
    if (!postcardIds.has(postcardId)) continue;
    const postcard = postcardById.get(postcardId);
    if (!postcard) continue;

    if (Number(report.version || 0) === Number(postcard.reportVersion || 0)) {
      const current =
        map.get(postcardId) ||
        {
          liked: false,
          disliked: false,
          reportedWrongLocation: false,
          favorited: false,
          collected: false,
        };
      current.reportedWrongLocation = true;
      map.set(postcardId, current);
    }
  }

  return map;
}

async function decoratePostcards(postcards, viewerUserId) {
  if (!postcards.length) return postcards;

  const users = await batchGetByIds(
    TABLES.users,
    postcards.map((p) => p.userId)
  );
  const userById = new Map(users.map((u) => [String(u.id), u]));
  const viewerFeedback = await getViewerFeedbackMap(viewerUserId, postcards);

  return postcards.map((postcard) => ({
    ...postcard,
    uploaderName: uploaderName(userById.get(String(postcard.userId))),
    viewerFeedback:
      viewerFeedback.get(String(postcard.id)) || {
        liked: false,
        disliked: false,
        reportedWrongLocation: false,
        favorited: false,
        collected: false,
      },
  }));
}

function normalizeSearchText(text) {
  return String(text || "").trim().toLowerCase();
}

function matchesKeyword(postcard, keyword) {
  if (!keyword) return true;
  const haystack = [
    postcard.title,
    postcard.notes,
    postcard.placeName,
    postcard.city,
    postcard.state,
    postcard.country,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(keyword);
}

function matchesBounds(postcard, north, south, east, west) {
  if (north == null || south == null || east == null || west == null) return true;
  if (postcard.latitude == null || postcard.longitude == null) return false;

  const lat = Number(postcard.latitude);
  const lon = Number(postcard.longitude);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return false;

  if (lat < south || lat > north) return false;
  if (west <= east) {
    return lon >= west && lon <= east;
  }
  return lon >= west || lon <= east;
}

function sortPostcards(items, sort) {
  const next = [...items];
  if (sort === "ranking") {
    next.sort((a, b) => {
      const al = Number(a.likeCount || 0);
      const bl = Number(b.likeCount || 0);
      if (bl !== al) return bl - al;
      const ad = Number(a.dislikeCount || 0);
      const bd = Number(b.dislikeCount || 0);
      if (ad !== bd) return ad - bd;
      const ar = Number(a.wrongLocationReports || 0);
      const br = Number(b.wrongLocationReports || 0);
      if (ar !== br) return ar - br;
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
    return next;
  }

  if (sort === "likes") {
    next.sort((a, b) => Number(b.likeCount || 0) - Number(a.likeCount || 0));
    return next;
  }

  if (sort === "reports") {
    next.sort((a, b) => Number(b.wrongLocationReports || 0) - Number(a.wrongLocationReports || 0));
    return next;
  }

  next.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return next;
}

async function scanAllPostcards() {
  return scanAll(TABLES.postcards);
}

async function scanAll(tableName) {
  const items = [];
  let lastKey;
  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lastKey,
      })
    );
    if (res.Items) items.push(...res.Items);
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function listMinePostcards(event, userId) {
  await recordUserAction(event, userId, "MY_POSTCARD_LIST");

  const rows = await queryAllByIndex({
    tableName: TABLES.postcards,
    indexName: "userId-createdAt-index",
    keyExpression: "#u = :u",
    attrNames: { "#u": "userId" },
    attrValues: { ":u": userId },
    scanIndexForward: false,
    limit: 300,
  });

  const filtered = rows.filter((row) => !row.deletedAt);
  const decorated = await decoratePostcards(filtered, userId);
  return response(200, decorated);
}

async function listSavedPostcards(event, userId) {
  await recordUserAction(event, userId, "SAVED_POSTCARD_LIST");

  const rows = await queryAllByIndex({
    tableName: TABLES.postcardFeedback,
    indexName: "userId-createdAt-index",
    keyExpression: "#u = :u",
    attrNames: { "#u": "userId" },
    attrValues: { ":u": userId },
    scanIndexForward: false,
    limit: 1000,
  });

  const orderedPostcardIds = [];
  const seen = new Set();
  for (const row of rows) {
    const action = String(row.action || "").toUpperCase();
    if (action !== "FAVORITE" && action !== "COLLECTED") continue;
    const postcardId = String(row.postcardId || "");
    if (!postcardId || seen.has(postcardId)) continue;
    seen.add(postcardId);
    orderedPostcardIds.push(postcardId);
  }

  if (!orderedPostcardIds.length) {
    return response(200, []);
  }

  const postcardRows = await batchGetByIds(TABLES.postcards, orderedPostcardIds);
  const byId = new Map(postcardRows.filter((row) => !row.deletedAt).map((row) => [String(row.id), row]));
  const orderedRows = orderedPostcardIds.map((id) => byId.get(id)).filter(Boolean);
  const decorated = await decoratePostcards(orderedRows, userId);

  return response(200, decorated);
}

async function listPublicPostcards(event) {
  const qs = event.queryStringParameters || {};
  const limit = Math.min(Math.max(parseInt(qs.limit || "120", 10) || 120, 1), 500);
  const keyword = normalizeSearchText(qs.q || qs.keyword || "");
  const north = parseNumber(qs.north);
  const south = parseNumber(qs.south);
  const east = parseNumber(qs.east);
  const west = parseNumber(qs.west);
  const sort = String(qs.sort || "ranking");
  const viewerUserId = await getViewerUserId(event);

  const rows = await scanAllPostcards();
  const filtered = rows.filter((row) => {
    if (row.deletedAt) return false;
    if (!matchesBounds(row, north, south, east, west)) return false;
    if (!matchesKeyword(row, keyword)) return false;
    return true;
  });

  const sorted = sortPostcards(filtered, sort);
  const hasMore = sorted.length > limit;
  const items = sorted.slice(0, limit);
  const decorated = await decoratePostcards(items, viewerUserId);

  return response(200, {
    items: decorated,
    total: filtered.length,
    hasMore,
    limit,
    sort,
  });
}

async function listPostcards(event) {
  const qs = event.queryStringParameters || {};
  const mineOnly = String(qs.mine || "") === "1";
  const savedOnly = String(qs.saved || "") === "1";

  if (mineOnly || savedOnly) {
    const auth = await requireAuthenticatedUser(event);
    if (!auth.ok) return auth.response;
    if (mineOnly) return listMinePostcards(event, String(auth.user.id));
    return listSavedPostcards(event, String(auth.user.id));
  }

  return listPublicPostcards(event);
}

async function getPostcardById(event, id) {
  const row = await ddb.send(
    new GetCommand({
      TableName: TABLES.postcards,
      Key: { id },
    })
  );

  if (!row.Item || row.Item.deletedAt) {
    return response(404, { error: "Postcard not found" });
  }

  const viewerUserId = await getViewerUserId(event);
  const [decorated] = await decoratePostcards([row.Item], viewerUserId);
  return response(200, decorated);
}

async function reverseGeocode(latitude, longitude) {
  if (latitude == null || longitude == null) return null;
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");

    const res = await fetch(url.toString(), {
      headers: {
        "user-agent": "pikmin-postcard/1.0",
      },
    });

    if (!res.ok) return null;
    const data = await res.json();
    const address = data?.address || {};

    return {
      city: address.city || address.town || address.village || address.hamlet || null,
      state: address.state || address.region || null,
      country: address.country || null,
    };
  } catch {
    return null;
  }
}

async function createPostcard(event) {
  const userResult = await requireAuthenticatedUser(event);
  if (!userResult.ok) return userResult.response;

  const { user } = userResult;
  if (String(user.approvalStatus || "APPROVED") !== "APPROVED" || user.canCreatePostcard === false) {
    return response(403, { error: "Not allowed to create postcards." });
  }

  const body = parseBody(event);
  const title = String(body.title || "").trim();
  if (!title) {
    return response(400, { error: "title is required" });
  }

  const latitude = parseNumber(body.latitude);
  const longitude = parseNumber(body.longitude);
  const reverse = await reverseGeocode(latitude, longitude);

  const now = nowIso();
  const id = `pc_${crypto.randomUUID().replace(/-/g, "")}`;
  const item = {
    id,
    userId: user.id,
    title,
    postcardType: String(body.postcardType || "UNKNOWN").toUpperCase(),
    notes: body.notes != null ? String(body.notes) : null,
    imageUrl: body.imageUrl ? String(body.imageUrl) : null,
    originalImageUrl: body.originalImageUrl ? String(body.originalImageUrl) : null,
    capturedAt: body.capturedAt ? String(body.capturedAt) : null,
    city: reverse?.city ?? (body.city ? String(body.city) : null),
    state: reverse?.state ?? (body.state ? String(body.state) : null),
    country: reverse?.country ?? (body.country ? String(body.country) : null),
    placeName: body.placeName ? String(body.placeName) : null,
    latitude,
    longitude,
    aiLatitude: body.aiLatitude != null ? parseNumber(body.aiLatitude) : null,
    aiLongitude: body.aiLongitude != null ? parseNumber(body.aiLongitude) : null,
    aiConfidence: body.aiConfidence != null ? parseNumber(body.aiConfidence) : null,
    aiPlaceGuess: body.aiPlaceGuess ? String(body.aiPlaceGuess) : null,
    likeCount: 0,
    dislikeCount: 0,
    wrongLocationReports: 0,
    reportVersion: 1,
    locationStatus: String(body.locationStatus || "AUTO").toUpperCase(),
    locationModelVersion: body.locationModelVersion ? String(body.locationModelVersion) : null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await ddb.send(new PutCommand({ TableName: TABLES.postcards, Item: item }));
  await recordUserAction(event, user.id, "POSTCARD_CREATE", {
    postcardType: item.postcardType,
    locationStatus: item.locationStatus,
  });

  const [decorated] = await decoratePostcards([item], user.id);
  return response(201, decorated);
}

async function updatePostcard(event, postcardId) {
  const userResult = await requireAuthenticatedUser(event);
  if (!userResult.ok) return userResult.response;
  const { user } = userResult;

  const existingRes = await ddb.send(
    new GetCommand({
      TableName: TABLES.postcards,
      Key: { id: postcardId },
    })
  );
  const existing = existingRes.Item;
  if (!existing || existing.deletedAt) {
    return response(404, { error: "Postcard not found." });
  }

  if (String(existing.userId) !== String(user.id) && !["ADMIN", "MANAGER"].includes(String(user.role || ""))) {
    return response(403, { error: "No permission to edit this postcard." });
  }

  const body = parseBody(event);
  if (body && typeof body === "object" && "crop" in body) {
    return response(400, { error: "Crop edit is not yet supported in serverless route." });
  }

  const latitude = body.latitude === null ? null : body.latitude !== undefined ? parseNumber(body.latitude) : existing.latitude;
  const longitude =
    body.longitude === null ? null : body.longitude !== undefined ? parseNumber(body.longitude) : existing.longitude;
  const reverse = await reverseGeocode(latitude, longitude);

  const updated = {
    ...existing,
    title: body.title != null ? String(body.title).trim() || existing.title : existing.title,
    postcardType: body.postcardType ? String(body.postcardType).toUpperCase() : existing.postcardType,
    notes: body.notes !== undefined ? (body.notes === null ? null : String(body.notes)) : existing.notes,
    placeName:
      body.placeName !== undefined ? (body.placeName === null ? null : String(body.placeName)) : existing.placeName,
    latitude,
    longitude,
    city: reverse?.city ?? (body.city !== undefined ? body.city : existing.city),
    state: reverse?.state ?? (body.state !== undefined ? body.state : existing.state),
    country: reverse?.country ?? (body.country !== undefined ? body.country : existing.country),
    updatedAt: nowIso(),
  };

  await ddb.send(new PutCommand({ TableName: TABLES.postcards, Item: updated }));
  await recordUserAction(event, user.id, "POSTCARD_EDIT", { postcardId });

  const [decorated] = await decoratePostcards([updated], user.id);
  return response(200, decorated);
}

async function softDeletePostcard(event, postcardId) {
  const userResult = await requireAuthenticatedUser(event);
  if (!userResult.ok) return userResult.response;
  const { user } = userResult;

  const existingRes = await ddb.send(
    new GetCommand({
      TableName: TABLES.postcards,
      Key: { id: postcardId },
    })
  );
  const existing = existingRes.Item;
  if (!existing || existing.deletedAt) {
    return response(404, { error: "Postcard not found." });
  }

  if (String(existing.userId) !== String(user.id) && !["ADMIN", "MANAGER"].includes(String(user.role || ""))) {
    return response(403, { error: "No permission to delete this postcard." });
  }

  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.postcards,
      Key: { id: postcardId },
      UpdateExpression: "SET deletedAt = :deletedAt, updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":deletedAt": nowIso(),
        ":updatedAt": nowIso(),
      },
    })
  );

  await recordUserAction(event, user.id, "POSTCARD_SOFT_DELETE", { postcardId });
  return response(200, { ok: true });
}

function normalizeFeedbackAction(action) {
  const value = String(action || "").toLowerCase();
  if (value === "like") return "LIKE";
  if (value === "dislike") return "DISLIKE";
  if (value === "favorite") return "FAVORITE";
  if (value === "collected") return "COLLECTED";
  if (value === "report" || value === "report_wrong_location") return "REPORT_WRONG_LOCATION";
  return "";
}

async function getFeedbackByUnique(uniqueKey) {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.postcardFeedback,
      IndexName: "uniqueKey-index",
      KeyConditionExpression: "#u = :u",
      ExpressionAttributeNames: { "#u": "uniqueKey" },
      ExpressionAttributeValues: { ":u": uniqueKey },
      Limit: 1,
    })
  );
  return res.Items?.[0] || null;
}

async function addPostcardCounter(postcardId, field, delta) {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.postcards,
      Key: { id: postcardId },
      UpdateExpression: "SET #f = if_not_exists(#f, :zero) + :delta, updatedAt = :updatedAt",
      ExpressionAttributeNames: { "#f": field },
      ExpressionAttributeValues: {
        ":zero": 0,
        ":delta": delta,
        ":updatedAt": nowIso(),
      },
    })
  );
}

async function createOrGetReportCase(postcardId, version) {
  const rows = await queryAllByIndex({
    tableName: TABLES.postcardReportCases,
    indexName: "postcardId-updatedAt-index",
    keyExpression: "#p = :p",
    attrNames: { "#p": "postcardId" },
    attrValues: { ":p": postcardId },
    scanIndexForward: false,
  });

  const existing = rows.find((row) => Number(row.version || 0) === Number(version));
  if (existing) return existing;

  const now = nowIso();
  const item = {
    id: `rpc_${crypto.randomUUID().replace(/-/g, "")}`,
    postcardId,
    version,
    status: "PENDING",
    adminNote: null,
    resolvedAt: null,
    resolvedByUserId: null,
    createdAt: now,
    updatedAt: now,
  };
  await ddb.send(new PutCommand({ TableName: TABLES.postcardReportCases, Item: item }));
  return item;
}

async function getPostcardFeedbackSummary(postcardId, userId) {
  const postcardRes = await ddb.send(
    new GetCommand({ TableName: TABLES.postcards, Key: { id: postcardId } })
  );
  const postcard = postcardRes.Item;
  if (!postcard) return null;

  const [decorated] = await decoratePostcards([postcard], userId);
  return decorated;
}

async function submitFeedback(event, postcardId) {
  const userResult = await requireAuthenticatedUser(event);
  if (!userResult.ok) return userResult.response;
  const { user } = userResult;

  if (String(user.approvalStatus || "APPROVED") !== "APPROVED" || user.canVote === false) {
    return response(403, { error: "Not allowed to submit feedback." });
  }

  const body = parseBody(event);
  const action = normalizeFeedbackAction(body.action);
  if (!action) {
    return response(400, { error: "Invalid action" });
  }

  const postcardRes = await ddb.send(
    new GetCommand({
      TableName: TABLES.postcards,
      Key: { id: postcardId },
    })
  );
  const postcard = postcardRes.Item;
  if (!postcard || postcard.deletedAt) {
    return response(404, { error: "Postcard not found." });
  }

  const now = nowIso();
  let result = "added";
  let normalizedAction = String(body.action || "").toLowerCase();
  if (normalizedAction === "report_wrong_location") normalizedAction = "report";

  if (action === "LIKE" || action === "DISLIKE") {
    const likeKey = `${postcardId}#${user.id}#LIKE`;
    const dislikeKey = `${postcardId}#${user.id}#DISLIKE`;
    const sameKey = action === "LIKE" ? likeKey : dislikeKey;
    const oppositeKey = action === "LIKE" ? dislikeKey : likeKey;

    const same = await getFeedbackByUnique(sameKey);
    const opposite = await getFeedbackByUnique(oppositeKey);

    if (same) {
      await ddb.send(new DeleteCommand({ TableName: TABLES.postcardFeedback, Key: { id: same.id } }));
      await addPostcardCounter(postcardId, action === "LIKE" ? "likeCount" : "dislikeCount", -1);
      result = "removed";
    } else {
      if (opposite) {
        await ddb.send(
          new DeleteCommand({
            TableName: TABLES.postcardFeedback,
            Key: { id: opposite.id },
          })
        );
        await addPostcardCounter(postcardId, action === "LIKE" ? "dislikeCount" : "likeCount", -1);
        result = "switched";
      }

      await ddb.send(
        new PutCommand({
          TableName: TABLES.postcardFeedback,
          Item: {
            id: `fb_${crypto.randomUUID().replace(/-/g, "")}`,
            postcardId,
            userId: user.id,
            action,
            createdAt: now,
            uniqueKey: `${postcardId}#${user.id}#${action}`,
          },
        })
      );
      await addPostcardCounter(postcardId, action === "LIKE" ? "likeCount" : "dislikeCount", 1);
    }
  } else if (action === "FAVORITE" || action === "COLLECTED") {
    const key = `${postcardId}#${user.id}#${action}`;
    const existing = await getFeedbackByUnique(key);
    if (existing) {
      await ddb.send(new DeleteCommand({ TableName: TABLES.postcardFeedback, Key: { id: existing.id } }));
      result = "removed";
    } else {
      await ddb.send(
        new PutCommand({
          TableName: TABLES.postcardFeedback,
          Item: {
            id: `fb_${crypto.randomUUID().replace(/-/g, "")}`,
            postcardId,
            userId: user.id,
            action,
            createdAt: now,
            uniqueKey: key,
          },
        })
      );
      result = "added";
    }
  } else {
    const reasonMap = {
      wrong_location: "WRONG_LOCATION",
      spam: "SPAM",
      illegal_image: "ILLEGAL_IMAGE",
      other: "OTHER",
    };
    const reason = reasonMap[String(body.reason || "wrong_location")] || "WRONG_LOCATION";
    const description = body.description ? String(body.description).trim().slice(0, 1200) : null;

    const uniqueKey = `${postcardId}#${postcard.reportVersion}#${user.id}`;
    const existingReport = await queryAllByIndex({
      tableName: TABLES.postcardReports,
      indexName: "uniqueKey-index",
      keyExpression: "#u = :u",
      attrNames: { "#u": "uniqueKey" },
      attrValues: { ":u": uniqueKey },
      limit: 1,
    });

    if (existingReport.length > 0) {
      result = "already_reported";
    } else {
      const reportCase = await createOrGetReportCase(postcardId, Number(postcard.reportVersion || 1));
      await ddb.send(
        new PutCommand({
          TableName: TABLES.postcardReports,
          Item: {
            id: `rpt_${crypto.randomUUID().replace(/-/g, "")}`,
            postcardId,
            version: Number(postcard.reportVersion || 1),
            caseId: reportCase.id,
            reporterUserId: user.id,
            reason,
            description,
            uniqueKey,
            createdAt: now,
            updatedAt: now,
          },
        })
      );
      await addPostcardCounter(postcardId, "wrongLocationReports", 1);
    }
    normalizedAction = "report";
  }

  await recordUserAction(event, user.id, "POSTCARD_FEEDBACK", {
    postcardId,
    action: normalizedAction,
    result,
  });

  const summary = await getPostcardFeedbackSummary(postcardId, user.id);
  return response(200, {
    ...(summary || {}),
    result,
    action: normalizedAction,
  });
}

function buildPublicUrl(key) {
  if (S3_PUBLIC_BASE_URL) {
    return `${S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
  }
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
}

async function uploadImage(event) {
  if (!S3_BUCKET) {
    return response(500, { error: "S3_BUCKET_NAME is not configured" });
  }

  const body = parseBody(event);
  const filename = String(body.filename || "image.jpg");
  const contentType = String(body.contentType || "image/jpeg");
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const datePart = new Date().toISOString().slice(0, 10);
  const key = `uploads/original/${datePart}/${crypto.randomUUID()}-${sanitized}`;

  const cmd = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 900 });

  return response(200, {
    uploadUrl,
    key,
    imageUrl: buildPublicUrl(key),
    expiresIn: 900,
  });
}

async function listDetectionJobs(event) {
  const userResult = await requireAuthenticatedUser(event);
  if (!userResult.ok) return userResult.response;
  const { user } = userResult;

  await recordUserAction(event, user.id, "DETECTION_JOB_LIST");

  const rows = await queryAllByIndex({
    tableName: TABLES.detectionJobs,
    indexName: "userId-createdAt-index",
    keyExpression: "#u = :u",
    attrNames: { "#u": "userId" },
    attrValues: { ":u": user.id },
    scanIndexForward: false,
    limit: 200,
  });

  return response(200, rows);
}

function extractJsonObject(rawText) {
  const fenced = rawText.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  if (start >= 0 && end > start) return rawText.slice(start, end + 1);
  throw new Error("Model output did not contain a JSON object.");
}

async function detectWithGeminiInline(mimeType, bytes) {
  if (!GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is missing");
  }

  const models = Array.from(new Set([GEMINI_MODEL, "gemini-2.5-flash", "gemini-2.5-flash-lite"]));
  const prompt = [
    "You are a geolocation inference model for postcard photos.",
    "Estimate where this photo was likely taken and return only strict JSON.",
    '{"latitude": number, "longitude": number, "confidence": number, "place_guess": string}',
    "No markdown, no explanation.",
  ].join("\n");

  const base64Image = bytes.toString("base64");
  let lastError = null;

  for (let i = 0; i < models.length; i += 1) {
    const model = models[i];
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_GENERATIVE_AI_API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType,
                    data: base64Image,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (res.ok) {
      const json = await res.json();
      const modelText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!modelText) {
        throw new Error("Gemini response did not include text output.");
      }
      const parsed = JSON.parse(extractJsonObject(modelText));

      return {
        latitude: Number(parsed.latitude),
        longitude: Number(parsed.longitude),
        confidence: Number(parsed.confidence),
        place_guess: String(parsed.place_guess || ""),
        modelVersion: model,
      };
    }

    const errorText = await res.text();
    if (res.status === 404 && i < models.length - 1) {
      continue;
    }

    lastError = new Error(`Gemini request failed: ${errorText}`);
    break;
  }

  throw lastError || new Error("Gemini request failed");
}

async function submitDetectionJob(event) {
  const userResult = await requireAuthenticatedUser(event);
  if (!userResult.ok) return userResult.response;
  const { user } = userResult;

  if (String(user.approvalStatus || "APPROVED") !== "APPROVED" || user.canSubmitDetection === false) {
    return response(403, { error: "Not allowed to submit detection jobs." });
  }

  const body = parseBody(event);
  const imageUrl = String(body.imageUrl || "").trim();
  const mimeType = String(body.mimeType || "image/jpeg");
  if (!imageUrl) {
    return response(400, { error: "imageUrl is required" });
  }

  const now = nowIso();
  const jobId = `dj_${crypto.randomUUID().replace(/-/g, "")}`;
  const jobBase = {
    id: jobId,
    userId: user.id,
    imageUrl,
    status: "QUEUED",
    latitude: null,
    longitude: null,
    confidence: null,
    placeGuess: null,
    errorMessage: null,
    modelVersion: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await ddb.send(new PutCommand({ TableName: TABLES.detectionJobs, Item: jobBase }));
  await recordUserAction(event, user.id, "DETECTION_JOB_SUBMIT", { imageUrl });

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.detectionJobs,
        Key: { id: jobId },
        UpdateExpression: "SET #s = :s, updatedAt = :updatedAt",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":s": "PROCESSING",
          ":updatedAt": nowIso(),
        },
      })
    );

    const imageRes = await fetch(imageUrl, { cache: "no-store" });
    if (!imageRes.ok) {
      throw new Error("Failed to load uploaded image for detection.");
    }
    const bytes = Buffer.from(await imageRes.arrayBuffer());
    const detected = await detectWithGeminiInline(mimeType, bytes);

    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.detectionJobs,
        Key: { id: jobId },
        UpdateExpression:
          "SET #s = :s, latitude = :lat, longitude = :lon, confidence = :conf, placeGuess = :place, modelVersion = :model, completedAt = :completedAt, errorMessage = :err, updatedAt = :updatedAt",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":s": "SUCCEEDED",
          ":lat": detected.latitude,
          ":lon": detected.longitude,
          ":conf": detected.confidence,
          ":place": detected.place_guess,
          ":model": detected.modelVersion,
          ":completedAt": nowIso(),
          ":err": null,
          ":updatedAt": nowIso(),
        },
      })
    );

    const rev = await reverseGeocode(detected.latitude, detected.longitude);
    const createdAt = nowIso();
    const postcardId = `pc_${crypto.randomUUID().replace(/-/g, "")}`;
    const postcard = {
      id: postcardId,
      userId: user.id,
      title: detected.place_guess?.trim() ? `AI: ${detected.place_guess}` : "AI detected postcard",
      postcardType: "UNKNOWN",
      notes: "Auto-created from AI detection upload.",
      imageUrl,
      originalImageUrl: imageUrl,
      capturedAt: null,
      city: rev?.city || null,
      state: rev?.state || null,
      country: rev?.country || null,
      placeName: detected.place_guess || null,
      latitude: detected.latitude,
      longitude: detected.longitude,
      aiLatitude: detected.latitude,
      aiLongitude: detected.longitude,
      aiConfidence: detected.confidence,
      aiPlaceGuess: detected.place_guess || null,
      likeCount: 0,
      dislikeCount: 0,
      wrongLocationReports: 0,
      reportVersion: 1,
      locationStatus: "AUTO",
      locationModelVersion: detected.modelVersion,
      deletedAt: null,
      createdAt,
      updatedAt: createdAt,
    };

    const existing = await queryAllByIndex({
      tableName: TABLES.postcards,
      indexName: "userId-createdAt-index",
      keyExpression: "#u = :u",
      attrNames: { "#u": "userId" },
      attrValues: { ":u": user.id },
      scanIndexForward: false,
      limit: 400,
    });

    const already = existing.find((row) => !row.deletedAt && String(row.imageUrl || "") === imageUrl);
    if (!already) {
      await ddb.send(new PutCommand({ TableName: TABLES.postcards, Item: postcard }));
    }

    return response(202, {
      id: jobId,
      status: "SUCCEEDED",
      imageUrl,
      message: "Detection job processed. Check your dashboard for result.",
    });
  } catch (error) {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.detectionJobs,
        Key: { id: jobId },
        UpdateExpression: "SET #s = :s, errorMessage = :err, completedAt = :completedAt, updatedAt = :updatedAt",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":s": "FAILED",
          ":err": error instanceof Error ? error.message : String(error),
          ":completedAt": nowIso(),
          ":updatedAt": nowIso(),
        },
      })
    );

    return response(202, {
      id: jobId,
      status: "FAILED",
      imageUrl,
      message: "Detection job failed. Check dashboard for details.",
    });
  }
}

async function getProfile(event) {
  const userResult = await requireAuthenticatedUser(event);
  if (!userResult.ok) return userResult.response;
  const { user } = userResult;

  await recordUserAction(event, user.id, "PROFILE_GET");
  return response(200, {
    email: user.email,
    displayName: user.displayName || null,
  });
}

async function patchProfile(event) {
  const userResult = await requireAuthenticatedUser(event);
  if (!userResult.ok) return userResult.response;
  const { user } = userResult;

  const body = parseBody(event);
  const displayName = String(body.displayName || "").trim();
  if (!displayName) {
    return response(400, { error: "displayName is required" });
  }

  const updated = {
    ...user,
    displayName,
    updatedAt: nowIso(),
  };

  await ddb.send(new PutCommand({ TableName: TABLES.users, Item: updated }));
  await recordUserAction(event, user.id, "PROFILE_UPDATE", { hasDisplayName: true });

  return response(200, {
    email: updated.email,
    displayName: updated.displayName,
  });
}

async function submitFeedbackMessage(event) {
  const userResult = await requireAuthenticatedUser(event);
  if (!userResult.ok) return userResult.response;
  const { user } = userResult;

  if (String(user.approvalStatus || "APPROVED") !== "APPROVED") {
    return response(403, { error: "Only approved users can submit feedback." });
  }

  const body = parseBody(event);
  const subject = String(body.subject || "").trim();
  const message = String(body.message || "").trim();

  if (subject.length < 2 || subject.length > 120) {
    return response(400, { error: "subject must be between 2 and 120 chars" });
  }
  if (message.length < 10 || message.length > 5000) {
    return response(400, { error: "message must be between 10 and 5000 chars" });
  }

  const item = {
    id: `fbm_${crypto.randomUUID().replace(/-/g, "")}`,
    userId: user.id,
    subject,
    message,
    status: "OPEN",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  await ddb.send(new PutCommand({ TableName: TABLES.feedbackMessages, Item: item }));
  await recordUserAction(event, user.id, "FEEDBACK_SUBMIT", {
    subjectLength: subject.length,
    messageLength: message.length,
  });

  return response(201, item);
}

async function listMyReports(event) {
  const userResult = await requireAuthenticatedUser(event);
  if (!userResult.ok) return userResult.response;
  const { user } = userResult;

  await recordUserAction(event, user.id, "MY_POSTCARD_REPORTS_LIST");

  const reports = await queryAllByIndex({
    tableName: TABLES.postcardReports,
    indexName: "reporterUserId-createdAt-index",
    keyExpression: "#u = :u",
    attrNames: { "#u": "reporterUserId" },
    attrValues: { ":u": user.id },
    scanIndexForward: false,
    limit: 500,
  });

  if (!reports.length) return response(200, []);

  const postcardIds = reports.map((r) => String(r.postcardId));
  const caseIds = reports.map((r) => String(r.caseId));

  const [postcards, cases] = await Promise.all([
    batchGetByIds(TABLES.postcards, postcardIds),
    batchGetByIds(TABLES.postcardReportCases, caseIds),
  ]);

  const postcardById = new Map(postcards.map((p) => [String(p.id), p]));
  const caseById = new Map(cases.map((c) => [String(c.id), c]));

  const rows = reports.map((report) => {
    const postcard = postcardById.get(String(report.postcardId));
    const reportCase = caseById.get(String(report.caseId));

    return {
      reportId: String(report.id),
      caseId: String(report.caseId),
      postcardId: String(report.postcardId),
      postcardTitle: String(postcard?.title || "Unknown postcard"),
      postcardImageUrl: postcard?.imageUrl || null,
      postcardPlaceName: postcard?.placeName || null,
      postcardDeletedAt: postcard?.deletedAt || null,
      reportReason: String(report.reason || "WRONG_LOCATION"),
      reportDescription: report.description || null,
      reportVersion: Number(report.version || 1),
      status: String(reportCase?.status || "PENDING"),
      adminNote: reportCase?.adminNote || null,
      reportedAt: String(report.createdAt),
      statusUpdatedAt: String(reportCase?.updatedAt || report.updatedAt || report.createdAt),
    };
  });

  return response(200, rows);
}

async function deleteReport(event, reportId) {
  const userResult = await requireAuthenticatedUser(event);
  if (!userResult.ok) return userResult.response;
  const { user } = userResult;

  const reportRes = await ddb.send(
    new GetCommand({
      TableName: TABLES.postcardReports,
      Key: { id: reportId },
    })
  );
  const report = reportRes.Item;
  if (!report || String(report.reporterUserId) !== String(user.id)) {
    return response(404, { error: "Report not found." });
  }

  const reportCaseRes = await ddb.send(
    new GetCommand({
      TableName: TABLES.postcardReportCases,
      Key: { id: report.caseId },
    })
  );
  const reportCase = reportCaseRes.Item;

  if (reportCase && ["VERIFIED", "REMOVED"].includes(String(reportCase.status))) {
    return response(409, { error: "This report is already resolved and cannot be canceled." });
  }

  await ddb.send(
    new DeleteCommand({
      TableName: TABLES.postcardReports,
      Key: { id: reportId },
    })
  );

  const postcardRes = await ddb.send(
    new GetCommand({
      TableName: TABLES.postcards,
      Key: { id: report.postcardId },
    })
  );
  const postcard = postcardRes.Item;

  if (
    postcard &&
    Number(report.version || 0) === Number(postcard.reportVersion || 0) &&
    Number(postcard.wrongLocationReports || 0) > 0
  ) {
    await addPostcardCounter(String(report.postcardId), "wrongLocationReports", -1);
  }

  const remaining = await queryAllByIndex({
    tableName: TABLES.postcardReports,
    indexName: "caseId-createdAt-index",
    keyExpression: "#c = :c",
    attrNames: { "#c": "caseId" },
    attrValues: { ":c": report.caseId },
    limit: 2,
  });

  if (remaining.length === 0) {
    await ddb.send(
      new DeleteCommand({
        TableName: TABLES.postcardReportCases,
        Key: { id: report.caseId },
      })
    );
  }

  await recordUserAction(event, user.id, "POSTCARD_REPORT_CANCEL", {
    reportId,
    postcardId: report.postcardId,
  });

  return response(200, { ok: true });
}

function normalizeRole(value) {
  const role = String(value || "")
    .trim()
    .toUpperCase();
  if (role === "ADMIN" || role === "MANAGER" || role === "MEMBER") {
    return role;
  }
  return null;
}

function normalizeApprovalStatus(value) {
  const status = String(value || "")
    .trim()
    .toUpperCase();
  if (status === "APPROVED" || status === "PENDING") {
    return status;
  }
  return null;
}

function normalizeFeedbackMessageStatus(value) {
  const status = String(value || "")
    .trim()
    .toUpperCase();
  if (status === "OPEN" || status === "CLOSED") {
    return status;
  }
  return null;
}

function normalizeReportCaseStatus(value) {
  const status = String(value || "")
    .trim()
    .toUpperCase();
  if (status === "PENDING" || status === "IN_PROGRESS" || status === "VERIFIED" || status === "REMOVED") {
    return status;
  }
  return null;
}

function toLowerText(value) {
  return String(value || "").toLowerCase();
}

function includesKeyword(values, keyword) {
  if (!keyword) return true;
  return values.some((value) => toLowerText(value).includes(keyword));
}

function toIsoOrNull(value) {
  if (!value) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

async function exchangeGoogleAuthToken(event) {
  const body = parseBody(event);
  const idToken = String(body.idToken || "").trim();
  if (!idToken) {
    return response(400, { error: "idToken is required" });
  }

  let verified;
  try {
    verified = await verifyGoogleIdToken(idToken);
  } catch (error) {
    return response(401, {
      error: "Google token verification failed.",
      details: error instanceof Error ? error.message : String(error),
    });
  }

  const user = await ensureUserByEmail({
    email: verified.email,
    name: verified.name,
  });
  const token = createAuthTokenForUser(user);

  await recordUserAction(event, user.id, "AUTH_EXCHANGE", {
    provider: "google",
    googleSub: verified.googleSub,
  });

  return response(200, {
    token,
    user: toAuthUserResponse(user),
  });
}

async function getAuthSession(event) {
  const auth = await requireAuthenticatedUser(event);
  if (!auth.ok) {
    return response(200, { user: null });
  }

  return response(200, {
    user: toAuthUserResponse(auth.user),
  });
}

function isBootstrapAdminEmail(email) {
  return ADMIN_EMAILS.includes(normalizeEmail(email));
}

async function listAdminUsers(event) {
  const admin = await requireAdminUser(event);
  if (!admin.ok) return admin.response;

  const qs = event.queryStringParameters || {};
  const keyword = normalizeSearchText(qs.q || qs.keyword || "");
  const roleFilter = normalizeRole(qs.role);
  const limit = parseIntegerParam(qs.limit, 500, 1, 500);

  const [users, postcards] = await Promise.all([scanAll(TABLES.users), scanAllPostcards()]);
  const postcardCountByUserId = new Map();
  for (const postcard of postcards) {
    if (postcard.deletedAt) continue;
    const userId = String(postcard.userId || "");
    postcardCountByUserId.set(userId, Number(postcardCountByUserId.get(userId) || 0) + 1);
  }

  const rows = users
    .filter((user) => {
      const normalizedRole = normalizeRole(user.role) || roleForEmail(user.email);
      const approval = normalizeApprovalStatus(user.approvalStatus) || defaultApprovalStatusForRole(normalizedRole);
      if (roleFilter && normalizedRole !== roleFilter) return false;
      return includesKeyword(
        [user.email, user.displayName, normalizedRole, approval],
        keyword
      );
    })
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, limit)
    .map((user) => {
      const normalizedRole = normalizeRole(user.role) || roleForEmail(user.email);
      return {
        id: String(user.id),
        email: normalizeEmail(user.email),
        displayName: user.displayName ? String(user.displayName) : null,
        role: normalizedRole,
        approvalStatus:
          normalizeApprovalStatus(user.approvalStatus) || defaultApprovalStatusForRole(normalizedRole),
        canCreatePostcard:
          typeof user.canCreatePostcard === "boolean" ? user.canCreatePostcard : true,
        canSubmitDetection:
          typeof user.canSubmitDetection === "boolean" ? user.canSubmitDetection : true,
        canVote: typeof user.canVote === "boolean" ? user.canVote : true,
        createdAt: String(user.createdAt || nowIso()),
        postcardCount: Number(postcardCountByUserId.get(String(user.id)) || 0),
      };
    });

  await recordUserAction(event, admin.user.id, "ADMIN_USERS_LIST", {
    search: keyword,
    role: roleFilter || null,
  });

  return response(200, rows);
}

async function patchAdminUser(event) {
  const admin = await requireAdminUser(event);
  if (!admin.ok) return admin.response;

  const body = parseBody(event);
  const userId = String(body.userId || "").trim();
  if (!userId) {
    return response(400, { error: "userId is required" });
  }

  const role = normalizeRole(body.role);
  const approvalStatus = normalizeApprovalStatus(body.approvalStatus);
  if (!role || !approvalStatus) {
    return response(400, { error: "role and approvalStatus are required." });
  }

  const target = await getUserById(userId);
  if (!target) {
    return response(404, { error: "User not found." });
  }

  if (isBootstrapAdminEmail(target.email) && role !== "ADMIN") {
    return response(400, { error: "Default bootstrap admin account must remain ADMIN." });
  }
  if (isBootstrapAdminEmail(target.email) && approvalStatus !== "APPROVED") {
    return response(400, { error: "Default bootstrap admin account must remain APPROVED." });
  }

  const updated = {
    ...target,
    role,
    approvalStatus,
    canCreatePostcard: Boolean(body.canCreatePostcard),
    canSubmitDetection: Boolean(body.canSubmitDetection),
    canVote: Boolean(body.canVote),
    updatedAt: nowIso(),
  };

  await ddb.send(new PutCommand({ TableName: TABLES.users, Item: updated }));
  await recordUserAction(event, admin.user.id, "ADMIN_USER_ACCESS_UPDATE", {
    targetUserId: userId,
    role,
    approvalStatus,
    canCreatePostcard: updated.canCreatePostcard,
    canSubmitDetection: updated.canSubmitDetection,
    canVote: updated.canVote,
  });

  const postcards = await queryAllByIndex({
    tableName: TABLES.postcards,
    indexName: "userId-createdAt-index",
    keyExpression: "#u = :u",
    attrNames: { "#u": "userId" },
    attrValues: { ":u": userId },
    scanIndexForward: false,
    limit: 2000,
  });
  const postcardCount = postcards.filter((item) => !item.deletedAt).length;

  return response(200, {
    id: String(updated.id),
    email: normalizeEmail(updated.email),
    displayName: updated.displayName ? String(updated.displayName) : null,
    role,
    approvalStatus,
    canCreatePostcard: updated.canCreatePostcard,
    canSubmitDetection: updated.canSubmitDetection,
    canVote: updated.canVote,
    createdAt: String(updated.createdAt || nowIso()),
    postcardCount,
  });
}

function buildReasonCounts(reports) {
  return reports.reduce((acc, report) => {
    const reason = String(report.reason || "OTHER");
    acc[reason] = Number(acc[reason] || 0) + 1;
    return acc;
  }, {});
}

async function buildAdminReportCaseRecords(reportCases, options = {}) {
  if (!reportCases.length) return [];
  const reportTake =
    typeof options.reportTake === "number" && options.reportTake > 0 ? options.reportTake : null;

  const postcardIds = Array.from(new Set(reportCases.map((item) => String(item.postcardId || ""))));
  const postcards = await batchGetByIds(TABLES.postcards, postcardIds);
  const postcardById = new Map(postcards.map((item) => [String(item.id), item]));

  const reportRowsByCaseId = new Map();
  for (const reportCase of reportCases) {
    const rows = await queryAllByIndex({
      tableName: TABLES.postcardReports,
      indexName: "caseId-createdAt-index",
      keyExpression: "#c = :c",
      attrNames: { "#c": "caseId" },
      attrValues: { ":c": String(reportCase.id) },
      scanIndexForward: false,
      limit: reportTake || undefined,
    });
    reportRowsByCaseId.set(String(reportCase.id), rows);
  }

  const reporterUserIds = new Set();
  for (const rows of reportRowsByCaseId.values()) {
    for (const row of rows) {
      if (row.reporterUserId) reporterUserIds.add(String(row.reporterUserId));
    }
  }

  const uploaderIds = new Set(
    reportCases
      .map((reportCase) => postcardById.get(String(reportCase.postcardId)))
      .filter(Boolean)
      .map((postcard) => String(postcard.userId || ""))
  );
  const users = await batchGetByIds(TABLES.users, [...reporterUserIds, ...uploaderIds]);
  const userById = new Map(users.map((item) => [String(item.id), item]));

  return reportCases.map((reportCase) => {
    const postcard = postcardById.get(String(reportCase.postcardId));
    const reports = (reportRowsByCaseId.get(String(reportCase.id)) || []).map((row) => ({
      id: String(row.id),
      reason: String(row.reason || "OTHER"),
      description: row.description ? String(row.description) : null,
      createdAt: toIsoOrNull(row.createdAt) || nowIso(),
      reporterName: uploaderName(userById.get(String(row.reporterUserId || ""))),
    }));

    return {
      caseId: String(reportCase.id),
      postcardId: String(reportCase.postcardId || ""),
      version: Number(reportCase.version || 1),
      status: normalizeReportCaseStatus(reportCase.status) || "PENDING",
      adminNote: reportCase.adminNote ? String(reportCase.adminNote) : null,
      createdAt: toIsoOrNull(reportCase.createdAt) || nowIso(),
      updatedAt: toIsoOrNull(reportCase.updatedAt) || nowIso(),
      resolvedAt: toIsoOrNull(reportCase.resolvedAt),
      postcard: {
        id: String(postcard?.id || reportCase.postcardId || ""),
        title: String(postcard?.title || "Unknown postcard"),
        imageUrl: postcard?.imageUrl || null,
        placeName: postcard?.placeName || null,
        deletedAt: toIsoOrNull(postcard?.deletedAt),
        wrongLocationReports: Number(postcard?.wrongLocationReports || 0),
        reportVersion: Number(postcard?.reportVersion || reportCase.version || 1),
        uploaderName: uploaderName(userById.get(String(postcard?.userId || ""))),
      },
      reportCount: reports.length,
      reasonCounts: buildReasonCounts(reports),
      reports,
    };
  });
}

async function buildActiveReportCaseDetailMap(postcards) {
  if (!postcards.length) return new Map();

  const postcardById = new Map(postcards.map((postcard) => [String(postcard.id), postcard]));
  const trackedIds = new Set(postcards.map((postcard) => String(postcard.id)));
  const reportCases = (await scanAll(TABLES.postcardReportCases)).filter((item) =>
    trackedIds.has(String(item.postcardId || ""))
  );

  const caseByPostcardId = new Map();
  for (const reportCase of reportCases) {
    const postcardId = String(reportCase.postcardId || "");
    const postcard = postcardById.get(postcardId);
    if (!postcard) continue;
    if (Number(reportCase.version || 0) !== Number(postcard.reportVersion || 0)) {
      continue;
    }

    const existing = caseByPostcardId.get(postcardId);
    if (!existing || String(reportCase.updatedAt || "") > String(existing.updatedAt || "")) {
      caseByPostcardId.set(postcardId, reportCase);
    }
  }

  const selectedCases = [...caseByPostcardId.values()];
  const records = await buildAdminReportCaseRecords(selectedCases, { reportTake: 50 });
  const byCaseId = new Map(records.map((item) => [item.caseId, item]));
  const map = new Map();
  for (const [postcardId, reportCase] of caseByPostcardId.entries()) {
    const record = byCaseId.get(String(reportCase.id));
    if (record) {
      map.set(postcardId, record);
    }
  }
  return map;
}

async function listAdminPostcards(event) {
  const auth = await requireManagerUser(event);
  if (!auth.ok) return auth.response;

  const qs = event.queryStringParameters || {};
  const keyword = normalizeSearchText(qs.q || qs.keyword || "");
  const reportedOnly = parseBooleanParam(qs.reportedOnly, false);
  const limit = parseIntegerParam(qs.limit, 240, 1, 500);

  const [allPostcards, allUsers] = await Promise.all([scanAllPostcards(), scanAll(TABLES.users)]);
  const userById = new Map(allUsers.map((item) => [String(item.id), item]));

  const filtered = allPostcards.filter((postcard) => {
    if (!reportedOnly && postcard.deletedAt) return false;
    const uploader = userById.get(String(postcard.userId || ""));
    return includesKeyword(
      [
        postcard.title,
        postcard.notes,
        postcard.placeName,
        postcard.city,
        postcard.state,
        postcard.country,
        uploader?.email,
        uploader?.displayName,
      ],
      keyword
    );
  });

  const sorted = filtered.sort((a, b) => {
    const reportDiff = Number(b.wrongLocationReports || 0) - Number(a.wrongLocationReports || 0);
    if (reportDiff !== 0) return reportDiff;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });

  const activeCaseMap = await buildActiveReportCaseDetailMap(sorted);
  const withActiveCase = sorted
    .map((postcard) => {
      const activeCase = activeCaseMap.get(String(postcard.id));
      return {
        ...postcard,
        activeReportCaseId: activeCase?.caseId ?? null,
        activeReportCaseStatus: activeCase?.status ?? null,
        activeReportCaseUpdatedAt: activeCase?.updatedAt ?? null,
        activeReportAdminNote: activeCase?.adminNote ?? null,
        activeReportCount: activeCase?.reportCount ?? 0,
        activeReportReasonCounts: activeCase?.reasonCounts ?? {},
        activeReportReports: activeCase?.reports ?? [],
      };
    })
    .filter((postcard) => {
      if (!reportedOnly) return true;
      return postcard.activeReportCaseId !== null || Number(postcard.wrongLocationReports || 0) > 0;
    })
    .slice(0, limit);

  const decorated = await decoratePostcards(withActiveCase, String(auth.user.id));
  await recordUserAction(event, auth.user.id, reportedOnly ? "ADMIN_POSTCARDS_LIST_REPORTED" : "ADMIN_POSTCARDS_LIST", {
    reportedOnly,
    search: keyword,
  });

  return response(200, decorated);
}

async function listAdminReports(event) {
  const auth = await requireManagerUser(event);
  if (!auth.ok) return auth.response;

  const qs = event.queryStringParameters || {};
  const keyword = normalizeSearchText(qs.q || qs.keyword || "");
  const status =
    qs.status == null || qs.status === "" ? null : normalizeReportCaseStatus(qs.status);
  if (qs.status != null && qs.status !== "" && !status) {
    return response(400, { error: "Invalid report status." });
  }
  const limit = parseIntegerParam(qs.limit, 200, 1, 400);

  const cases = (await scanAll(TABLES.postcardReportCases))
    .filter((item) => !status || normalizeReportCaseStatus(item.status) === status)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

  const records = await buildAdminReportCaseRecords(cases, { reportTake: 30 });
  const filtered = records
    .filter((item) => {
      if (!keyword) return true;
      return includesKeyword(
        [
          item.postcard.title,
          item.postcard.placeName,
          item.postcard.uploaderName,
          ...item.reports.flatMap((report) => [report.description, report.reporterName, report.reason]),
        ],
        keyword
      );
    })
    .slice(0, limit);

  await recordUserAction(event, auth.user.id, "ADMIN_POSTCARD_REPORTS_LIST", {
    search: keyword,
    status: status || null,
  });

  return response(200, filtered);
}

async function getAdminReportCaseDetail(event, caseId) {
  const auth = await requireManagerUser(event);
  if (!auth.ok) return auth.response;

  const reportCaseRes = await ddb.send(
    new GetCommand({
      TableName: TABLES.postcardReportCases,
      Key: { id: caseId },
    })
  );
  if (!reportCaseRes.Item) {
    return response(404, { error: "Report case not found." });
  }

  const [record] = await buildAdminReportCaseRecords([reportCaseRes.Item], { reportTake: 300 });
  if (!record) {
    return response(404, { error: "Report case not found." });
  }

  await recordUserAction(event, auth.user.id, "ADMIN_POSTCARD_REPORT_DETAIL", { caseId });
  return response(200, record);
}

async function applyAdminReportCaseStatus(event, actorUserId, caseId, nextStatus, adminNote) {
  const reportCaseRes = await ddb.send(
    new GetCommand({
      TableName: TABLES.postcardReportCases,
      Key: { id: caseId },
    })
  );
  const reportCase = reportCaseRes.Item;
  if (!reportCase) {
    return response(404, { error: "Report case not found." });
  }

  const postcardRes = await ddb.send(
    new GetCommand({
      TableName: TABLES.postcards,
      Key: { id: reportCase.postcardId },
    })
  );
  const postcard = postcardRes.Item;
  if (!postcard) {
    return response(404, { error: "Postcard not found for report case." });
  }

  const now = nowIso();
  const shouldResolve = nextStatus === "VERIFIED" || nextStatus === "REMOVED";
  const normalizedAdminNote = adminNote ? String(adminNote).trim().slice(0, 1200) || null : null;
  const updatedCase = {
    ...reportCase,
    status: nextStatus,
    adminNote: normalizedAdminNote,
    resolvedAt: shouldResolve ? now : null,
    resolvedByUserId: shouldResolve ? actorUserId : null,
    updatedAt: now,
  };
  await ddb.send(new PutCommand({ TableName: TABLES.postcardReportCases, Item: updatedCase }));

  let updatedPostcard = { ...postcard };
  if (nextStatus === "VERIFIED" && Number(postcard.reportVersion || 0) === Number(reportCase.version || 0)) {
    updatedPostcard = {
      ...updatedPostcard,
      wrongLocationReports: 0,
      reportVersion: Number(postcard.reportVersion || 0) + 1,
      updatedAt: now,
    };
    await ddb.send(new PutCommand({ TableName: TABLES.postcards, Item: updatedPostcard }));
  } else if (nextStatus === "REMOVED") {
    updatedPostcard = {
      ...updatedPostcard,
      wrongLocationReports: 0,
      deletedAt: updatedPostcard.deletedAt || now,
      updatedAt: now,
    };
    await ddb.send(new PutCommand({ TableName: TABLES.postcards, Item: updatedPostcard }));
  }

  await recordUserAction(event, actorUserId, "ADMIN_POSTCARD_REPORT_STATUS_UPDATE", {
    caseId,
    postcardId: updatedPostcard.id,
    status: nextStatus,
  });

  return response(200, {
    caseId: String(updatedCase.id),
    postcardId: String(updatedPostcard.id),
    status: String(updatedCase.status),
    reportVersion: Number(updatedPostcard.reportVersion || 1),
    wrongLocationReports: Number(updatedPostcard.wrongLocationReports || 0),
    postcardDeletedAt: updatedPostcard.deletedAt || null,
  });
}

async function patchAdminReportCaseStatus(event, routeCaseId = null) {
  const auth = await requireManagerUser(event);
  if (!auth.ok) return auth.response;

  const body = parseBody(event);
  const caseId = routeCaseId || String(body.caseId || "").trim();
  const status = normalizeReportCaseStatus(body.status);
  if (!caseId || !status) {
    return response(400, { error: "caseId and status are required." });
  }

  return applyAdminReportCaseStatus(
    event,
    String(auth.user.id),
    caseId,
    status,
    body.adminNote ?? null
  );
}

async function listAdminFeedback(event) {
  const auth = await requireManagerUser(event);
  if (!auth.ok) return auth.response;

  const qs = event.queryStringParameters || {};
  const keyword = normalizeSearchText(qs.q || qs.keyword || "");
  const status =
    qs.status == null || qs.status === "" ? null : normalizeFeedbackMessageStatus(qs.status);
  if (qs.status != null && qs.status !== "" && !status) {
    return response(400, { error: "Invalid feedback status." });
  }
  const limit = parseIntegerParam(qs.limit, 300, 1, 500);

  const feedbackRows = await scanAll(TABLES.feedbackMessages);
  const userIds = Array.from(new Set(feedbackRows.map((item) => String(item.userId || "")).filter(Boolean)));
  const users = await batchGetByIds(TABLES.users, userIds);
  const userById = new Map(users.map((item) => [String(item.id), item]));

  const rows = feedbackRows
    .filter((item) => {
      const normalized = normalizeFeedbackMessageStatus(item.status) || "OPEN";
      if (status && normalized !== status) return false;
      const user = userById.get(String(item.userId || ""));
      return includesKeyword(
        [item.subject, item.message, user?.email, user?.displayName],
        keyword
      );
    })
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, limit)
    .map((item) => {
      const user = userById.get(String(item.userId || ""));
      return {
        id: String(item.id),
        subject: String(item.subject || ""),
        message: String(item.message || ""),
        status: normalizeFeedbackMessageStatus(item.status) || "OPEN",
        createdAt: toIsoOrNull(item.createdAt) || nowIso(),
        userEmail: normalizeEmail(user?.email || ""),
        userDisplayName: user?.displayName ? String(user.displayName) : null,
      };
    });

  await recordUserAction(event, auth.user.id, "ADMIN_FEEDBACK_LIST", {
    search: keyword,
    status: status || null,
  });

  return response(200, rows);
}

function normalizeRoutePath(inputPath) {
  let path = String(inputPath || "/").trim();
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1) {
    path = path.replace(/\/+$/, "");
  }

  if (path === "/api") return "/";
  if (path.startsWith("/api/")) {
    path = path.slice(4);
    if (!path.startsWith("/")) path = `/${path}`;
  }

  return path || "/";
}

function routeNotFound() {
  return response(404, { error: "Route not found" });
}

export const handler = async (event) => {
  try {
    const method = event?.requestContext?.http?.method || "GET";
    const rawPath = event?.rawPath || "/";
    const path = normalizeRoutePath(rawPath);

    if (method === "OPTIONS") {
      return { statusCode: 204, headers: CORS_HEADERS, body: "" };
    }

    if (method === "GET" && path === "/health") {
      return response(200, { ok: true, service: "pikmin-serverless-api" });
    }

    if (method === "POST" && path === "/auth/exchange") {
      return await exchangeGoogleAuthToken(event);
    }

    if (method === "GET" && path === "/auth/session") {
      return await getAuthSession(event);
    }

    if (method === "GET" && path === "/postcards") {
      return await listPostcards(event);
    }

    if (method === "POST" && path === "/postcards") {
      return await createPostcard(event);
    }

    if (method === "POST" && path === "/upload-image") {
      return await uploadImage(event);
    }

    if (method === "GET" && path === "/location-from-image") {
      return await listDetectionJobs(event);
    }

    if (method === "POST" && path === "/location-from-image") {
      return await submitDetectionJob(event);
    }

    if (method === "GET" && path === "/profile") {
      return await getProfile(event);
    }

    if (method === "PATCH" && path === "/profile") {
      return await patchProfile(event);
    }

    if (method === "POST" && path === "/feedback") {
      return await submitFeedbackMessage(event);
    }

    if (method === "GET" && path === "/reports") {
      return await listMyReports(event);
    }

    if (method === "GET" && path === "/admin/users") {
      return await listAdminUsers(event);
    }

    if (method === "PATCH" && path === "/admin/users") {
      return await patchAdminUser(event);
    }

    if (method === "GET" && path === "/admin/postcards") {
      return await listAdminPostcards(event);
    }

    if (method === "GET" && path === "/admin/reports") {
      return await listAdminReports(event);
    }

    if (method === "PATCH" && path === "/admin/reports") {
      return await patchAdminReportCaseStatus(event);
    }

    if (method === "GET" && path === "/admin/feedback") {
      return await listAdminFeedback(event);
    }

    const reportIdMatch = path.match(/^\/reports\/([^/]+)$/);
    if (method === "DELETE" && reportIdMatch) {
      return await deleteReport(event, reportIdMatch[1]);
    }

    const adminReportCaseMatch = path.match(/^\/admin\/reports\/([^/]+)$/);
    if (method === "GET" && adminReportCaseMatch) {
      return await getAdminReportCaseDetail(event, adminReportCaseMatch[1]);
    }
    if (method === "PATCH" && adminReportCaseMatch) {
      return await patchAdminReportCaseStatus(event, adminReportCaseMatch[1]);
    }

    const postcardIdMatch = path.match(/^\/postcards\/([^/]+)$/);
    if (method === "GET" && postcardIdMatch) {
      return await getPostcardById(event, postcardIdMatch[1]);
    }
    if (method === "PATCH" && postcardIdMatch) {
      return await updatePostcard(event, postcardIdMatch[1]);
    }
    if (method === "DELETE" && postcardIdMatch) {
      return await softDeletePostcard(event, postcardIdMatch[1]);
    }

    const feedbackMatch = path.match(/^\/postcards\/([^/]+)\/feedback$/);
    if (method === "POST" && feedbackMatch) {
      return await submitFeedback(event, feedbackMatch[1]);
    }

    return routeNotFound();
  } catch (error) {
    console.error(error);
    return response(500, {
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
