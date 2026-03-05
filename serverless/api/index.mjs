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

function getUserId(event) {
  return getHeader(event.headers, "x-user-id");
}

function getUserEmail(event) {
  return getHeader(event.headers, "x-user-email");
}

function parseNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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

function requireUserId(event) {
  const userId = getUserId(event);
  if (!userId) {
    return { ok: false, response: response(401, { error: "Missing x-user-id header" }) };
  }
  return { ok: true, userId };
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

async function ensureUserForRequest(event) {
  const userCheck = requireUserId(event);
  if (!userCheck.ok) return userCheck;

  let user = await getUserById(userCheck.userId);
  if (!user) {
    const email = getUserEmail(event);
    if (!email) {
      return {
        ok: false,
        response: response(401, { error: "User not found and x-user-email is missing" }),
      };
    }

    const now = nowIso();
    user = {
      id: userCheck.userId,
      email: String(email).toLowerCase(),
      displayName: null,
      role: "MEMBER",
      approvalStatus: "APPROVED",
      canCreatePostcard: true,
      canSubmitDetection: true,
      canVote: true,
      createdAt: now,
      updatedAt: now,
    };
    await ddb.send(new PutCommand({ TableName: TABLES.users, Item: user }));
  }

  return { ok: true, user };
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
  const items = [];
  let lastKey;
  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: TABLES.postcards,
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
  const viewerUserId = getUserId(event);

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
    const user = requireUserId(event);
    if (!user.ok) return user.response;
    if (mineOnly) return listMinePostcards(event, user.userId);
    return listSavedPostcards(event, user.userId);
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

  const viewerUserId = getUserId(event);
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
  const userResult = await ensureUserForRequest(event);
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
  const userResult = await ensureUserForRequest(event);
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
  const userResult = await ensureUserForRequest(event);
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
  const userResult = await ensureUserForRequest(event);
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
  const user = requireUserId(event);
  if (!user.ok) return user.response;

  await recordUserAction(event, user.userId, "DETECTION_JOB_LIST");

  const rows = await queryAllByIndex({
    tableName: TABLES.detectionJobs,
    indexName: "userId-createdAt-index",
    keyExpression: "#u = :u",
    attrNames: { "#u": "userId" },
    attrValues: { ":u": user.userId },
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
  const userResult = await ensureUserForRequest(event);
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
  const userResult = await ensureUserForRequest(event);
  if (!userResult.ok) return userResult.response;
  const { user } = userResult;

  await recordUserAction(event, user.id, "PROFILE_GET");
  return response(200, {
    email: user.email,
    displayName: user.displayName || null,
  });
}

async function patchProfile(event) {
  const userResult = await ensureUserForRequest(event);
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
  const userResult = await ensureUserForRequest(event);
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
  const user = requireUserId(event);
  if (!user.ok) return user.response;

  await recordUserAction(event, user.userId, "MY_POSTCARD_REPORTS_LIST");

  const reports = await queryAllByIndex({
    tableName: TABLES.postcardReports,
    indexName: "reporterUserId-createdAt-index",
    keyExpression: "#u = :u",
    attrNames: { "#u": "reporterUserId" },
    attrValues: { ":u": user.userId },
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
  const user = requireUserId(event);
  if (!user.ok) return user.response;

  const reportRes = await ddb.send(
    new GetCommand({
      TableName: TABLES.postcardReports,
      Key: { id: reportId },
    })
  );
  const report = reportRes.Item;
  if (!report || String(report.reporterUserId) !== String(user.userId)) {
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

  await recordUserAction(event, user.userId, "POSTCARD_REPORT_CANCEL", {
    reportId,
    postcardId: report.postcardId,
  });

  return response(200, { ok: true });
}

function routeNotFound() {
  return response(404, { error: "Route not found" });
}

export const handler = async (event) => {
  try {
    const method = event?.requestContext?.http?.method || "GET";
    const path = event?.rawPath || "/";

    if (method === "OPTIONS") {
      return { statusCode: 204, headers: CORS_HEADERS, body: "" };
    }

    if (method === "GET" && path === "/health") {
      return response(200, { ok: true, service: "pikmin-serverless-api" });
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

    const reportIdMatch = path.match(/^\/reports\/([^/]+)$/);
    if (method === "DELETE" && reportIdMatch) {
      return await deleteReport(event, reportIdMatch[1]);
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
