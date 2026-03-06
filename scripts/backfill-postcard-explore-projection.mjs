import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

const DEFAULT_GEO_BUCKET_LEVELS = [2, 8, 60];

function parseArgs(argv) {
  const getArgValue = (name) => {
    const flag = `--${name}`;
    const index = argv.indexOf(flag);
    if (index !== -1 && argv[index + 1]) {
      return String(argv[index + 1]).trim();
    }
    return "";
  };

  return {
    dryRun: argv.includes("--dry-run"),
    region: getArgValue("region"),
    prefix: getArgValue("prefix"),
  };
}

function toInteger(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 180) {
    return null;
  }
  return parsed;
}

function toGeoBucketLevels() {
  const legacySingle = toInteger(process.env.POSTCARD_GEO_BUCKET_DEGREES);
  const raw = String(process.env.POSTCARD_GEO_BUCKET_LEVELS || "").trim();
  if (!raw) {
    if (legacySingle) {
      return [legacySingle, legacySingle * 4, legacySingle * 30].map((value) =>
        Math.min(180, Math.max(1, value))
      );
    }
    return DEFAULT_GEO_BUCKET_LEVELS;
  }

  const values = Array.from(
    new Set(
      raw
        .split(",")
        .map((entry) => toInteger(entry))
        .filter((entry) => typeof entry === "number")
    )
  ).sort((left, right) => left - right);

  if (values.length !== 3) {
    return DEFAULT_GEO_BUCKET_LEVELS;
  }
  return values;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeLongitude(value) {
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
}

function geoBucketFromCoordinates(latitude, longitude, bucketDegrees) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  const lat = clamp(latitude, -90, 90);
  const lon = normalizeLongitude(longitude);
  const latCount = Math.ceil(180 / bucketDegrees);
  const lonCount = Math.ceil(360 / bucketDegrees);
  const latIndex = Math.min(
    latCount - 1,
    Math.max(0, Math.floor((lat + 90) / bucketDegrees))
  );
  const lonIndex = Math.min(
    lonCount - 1,
    Math.max(0, Math.floor((lon + 180) / bucketDegrees))
  );
  return `g${bucketDegrees}:${latIndex}:${lonIndex}`;
}

function geoBucketFieldsFromCoordinates(latitude, longitude, levels) {
  return {
    geoBucket: geoBucketFromCoordinates(latitude, longitude, levels[0]),
    geoBucketMedium: geoBucketFromCoordinates(latitude, longitude, levels[1]),
    geoBucketCoarse: geoBucketFromCoordinates(latitude, longitude, levels[2]),
  };
}

function toNullableString(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nowIso() {
  return new Date().toISOString();
}

function toIso(value, fallback) {
  const text = typeof value === "string" ? value : "";
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function normalizePostcardType(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (
    normalized === "MUSHROOM" ||
    normalized === "FLOWER" ||
    normalized === "EXPLORATION" ||
    normalized === "UNKNOWN"
  ) {
    return normalized;
  }
  return "UNKNOWN";
}

function normalizeLocationStatus(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (
    normalized === "AUTO" ||
    normalized === "USER_CONFIRMED" ||
    normalized === "MANUAL"
  ) {
    return normalized;
  }
  return "AUTO";
}

function toExploreProjectionRow(row, geoBucketLevels) {
  const id = String(row?.id || "").trim();
  const userId = String(row?.userId || "").trim();
  const title = String(row?.title || "").trim();
  if (!id || !userId || !title) {
    return null;
  }

  const timestamp = nowIso();
  const latitude = toNumberOrNull(row?.latitude);
  const longitude = toNumberOrNull(row?.longitude);
  const geoBuckets = {
    ...geoBucketFieldsFromCoordinates(latitude, longitude, geoBucketLevels),
    geoBucket: toNullableString(row?.geoBucket) ?? geoBucketFromCoordinates(latitude, longitude, geoBucketLevels[0]),
    geoBucketMedium:
      toNullableString(row?.geoBucketMedium) ?? geoBucketFromCoordinates(latitude, longitude, geoBucketLevels[1]),
    geoBucketCoarse:
      toNullableString(row?.geoBucketCoarse) ?? geoBucketFromCoordinates(latitude, longitude, geoBucketLevels[2]),
  };

  return {
    id,
    userId,
    title,
    postcardType: normalizePostcardType(row?.postcardType),
    notes: toNullableString(row?.notes),
    imageUrl: toNullableString(row?.imageUrl),
    capturedAt: toNullableString(row?.capturedAt),
    city: toNullableString(row?.city),
    state: toNullableString(row?.state),
    country: toNullableString(row?.country),
    placeName: toNullableString(row?.placeName),
    latitude,
    longitude,
    aiLatitude: toNumberOrNull(row?.aiLatitude),
    aiLongitude: toNumberOrNull(row?.aiLongitude),
    aiConfidence: toNumberOrNull(row?.aiConfidence),
    aiPlaceGuess: toNullableString(row?.aiPlaceGuess),
    likeCount: Number(row?.likeCount || 0),
    dislikeCount: Number(row?.dislikeCount || 0),
    wrongLocationReports: Number(row?.wrongLocationReports || 0),
    reportVersion: Number(row?.reportVersion || 1),
    locationStatus: normalizeLocationStatus(row?.locationStatus),
    locationModelVersion: toNullableString(row?.locationModelVersion),
    ...geoBuckets,
    deletedAt: toNullableString(row?.deletedAt),
    createdAt: toIso(row?.createdAt, timestamp),
    updatedAt: toIso(row?.updatedAt, timestamp),
  };
}

function chunk(list, size) {
  const out = [];
  for (let index = 0; index < list.length; index += size) {
    out.push(list.slice(index, index + size));
  }
  return out;
}

async function scanAll(doc, tableName) {
  const rows = [];
  let lastEvaluatedKey = undefined;
  do {
    const result = await doc.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    if (Array.isArray(result.Items)) {
      rows.push(...result.Items);
    }
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);
  return rows;
}

async function writeRows(doc, tableName, rows) {
  for (const rowChunk of chunk(rows, 25)) {
    await doc.send(
      new BatchWriteCommand({
        RequestItems: {
          [tableName]: rowChunk.map((row) => ({
            PutRequest: {
              Item: row,
            },
          })),
        },
      })
    );
  }
}

async function main() {
  const { dryRun, region: regionArg, prefix: prefixArg } = parseArgs(
    process.argv.slice(2)
  );
  const region =
    regionArg || process.env.AWS_REGION || process.env.S3_REGION || "us-east-1";
  const prefix =
    prefixArg ||
    String(process.env.DDB_TABLE_PREFIX || "pikmin-postcard-dev").trim() ||
    "pikmin-postcard-dev";
  const postcardTableName = `${prefix}-postcards`;
  const postcardExploreTableName = `${prefix}-postcards-explore`;
  const geoBucketLevels = toGeoBucketLevels();

  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
    marshallOptions: { removeUndefinedValues: true },
  });

  const sourceRows = await scanAll(doc, postcardTableName);
  const projectionRows = sourceRows
    .map((row) => toExploreProjectionRow(row, geoBucketLevels))
    .filter((row) => Boolean(row));

  console.log(
    `Scanned ${sourceRows.length} rows from ${postcardTableName}. Rebuilding ${projectionRows.length} rows for ${postcardExploreTableName}.`
  );

  if (dryRun) {
    console.log("Dry run enabled. No data was written.");
    return;
  }

  if (projectionRows.length > 0) {
    await writeRows(doc, postcardExploreTableName, projectionRows);
  }
  console.log(`Done. Upserted ${projectionRows.length} projection rows.`);
}

main().catch((error) => {
  console.error("Failed to backfill postcard explore projection:", error);
  process.exit(1);
});
