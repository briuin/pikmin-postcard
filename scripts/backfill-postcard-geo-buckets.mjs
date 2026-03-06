import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

const DEFAULT_GEO_BUCKET_LEVELS = [2, 8, 60];

function parseArgs(argv) {
  return {
    dryRun: argv.includes("--dry-run"),
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

function chunk(list, size) {
  const out = [];
  for (let index = 0; index < list.length; index += size) {
    out.push(list.slice(index, index + size));
  }
  return out;
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
  const { dryRun } = parseArgs(process.argv.slice(2));
  const region = process.env.AWS_REGION || process.env.S3_REGION || "us-east-1";
  const prefix =
    String(process.env.DDB_TABLE_PREFIX || "pikmin-postcard-dev").trim() ||
    "pikmin-postcard-dev";
  const bucketLevels = toGeoBucketLevels();
  const postcardsTableName = `${prefix}-postcards`;
  const timestamp = new Date().toISOString();

  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
    marshallOptions: { removeUndefinedValues: true },
  });

  const rows = await scanAll(doc, postcardsTableName);
  const updates = [];
  for (const row of rows) {
    const id = String(row?.id || "").trim();
    if (!id) {
      continue;
    }

    const latitude = toFiniteNumber(row?.latitude);
    const longitude = toFiniteNumber(row?.longitude);
    if (latitude === null || longitude === null) {
      continue;
    }

    const expected = geoBucketFieldsFromCoordinates(latitude, longitude, bucketLevels);
    const current = {
      geoBucket: String(row?.geoBucket || "").trim(),
      geoBucketMedium: String(row?.geoBucketMedium || "").trim(),
      geoBucketCoarse: String(row?.geoBucketCoarse || "").trim(),
    };
    if (
      current.geoBucket === expected.geoBucket &&
      current.geoBucketMedium === expected.geoBucketMedium &&
      current.geoBucketCoarse === expected.geoBucketCoarse
    ) {
      continue;
    }

    updates.push({
      ...row,
      ...expected,
      updatedAt: timestamp,
    });
  }

  console.log(
    `Scanned ${rows.length} postcards in ${postcardsTableName}. Pending geo bucket updates: ${updates.length}.`
  );

  if (dryRun) {
    console.log("Dry run enabled. No data was written.");
    return;
  }

  if (updates.length > 0) {
    await writeRows(doc, postcardsTableName, updates);
  }
  console.log(`Done. Updated ${updates.length} postcards.`);
}

main().catch((error) => {
  console.error("Failed to backfill postcard geo buckets:", error);
  process.exit(1);
});
