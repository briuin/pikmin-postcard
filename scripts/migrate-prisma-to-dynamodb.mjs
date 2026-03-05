import { PrismaClient } from "@prisma/client";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { getTableNames } from "./dynamo-tables.mjs";

function getArg(name, fallback) {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return fallback;
}

function normalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const next = {};
    for (const [k, v] of Object.entries(value)) next[k] = normalize(v);
    return next;
  }
  return value;
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
}

async function batchPut(doc, tableName, items) {
  const batches = chunk(items, 25);
  let written = 0;
  for (const group of batches) {
    let requestItems = {
      [tableName]: group.map((Item) => ({ PutRequest: { Item } })),
    };

    let retries = 0;
    while (Object.keys(requestItems).length > 0) {
      const res = await doc.send(new BatchWriteCommand({ RequestItems: requestItems }));
      requestItems = res.UnprocessedItems ?? {};
      if (Object.keys(requestItems).length > 0) {
        retries += 1;
        if (retries > 10) {
          throw new Error(`Too many retries writing ${tableName}`);
        }
        await new Promise((r) => setTimeout(r, 100 * retries));
      }
    }

    written += group.length;
  }

  return written;
}

async function main() {
  const region = getArg("region", process.env.AWS_REGION || "us-east-1");
  const prefix = getArg("prefix", process.env.DDB_TABLE_PREFIX || "pikmin-postcard");

  const names = getTableNames(prefix);
  const prisma = new PrismaClient();
  const ddb = new DynamoDBClient({ region });
  const doc = DynamoDBDocumentClient.from(ddb, {
    marshallOptions: { removeUndefinedValues: true },
  });

  console.log(`region=${region}`);
  console.log(`prefix=${prefix}`);

  const users = await prisma.user.findMany();
  const userItems = users.map((row) => normalize(row));
  console.log(`users: ${userItems.length}`);
  await batchPut(doc, names.users, userItems);

  const postcards = await prisma.postcard.findMany();
  const postcardItems = postcards.map((row) => normalize(row));
  console.log(`postcards: ${postcardItems.length}`);
  await batchPut(doc, names.postcards, postcardItems);

  const tags = await prisma.tag.findMany();
  const tagItems = tags.map((row) => normalize(row));
  console.log(`tags: ${tagItems.length}`);
  await batchPut(doc, names.tags, tagItems);

  const postcardTags = await prisma.postcardTag.findMany();
  const postcardTagItems = postcardTags.map((row) => {
    const normalized = normalize(row);
    return {
      id: `${normalized.postcardId}#${normalized.tagId}`,
      ...normalized,
    };
  });
  console.log(`postcardTags: ${postcardTagItems.length}`);
  await batchPut(doc, names.postcardTags, postcardTagItems);

  const detectionJobs = await prisma.detectionJob.findMany();
  const detectionJobItems = detectionJobs.map((row) => normalize(row));
  console.log(`detectionJobs: ${detectionJobItems.length}`);
  await batchPut(doc, names.detectionJobs, detectionJobItems);

  const postcardFeedbackRows = await prisma.postcardFeedback.findMany();
  const feedbackItems = postcardFeedbackRows.map((row) => {
    const normalized = normalize(row);
    return {
      ...normalized,
      uniqueKey: `${normalized.postcardId}#${normalized.userId}#${normalized.action}`,
    };
  });
  console.log(`postcardFeedback: ${feedbackItems.length}`);
  await batchPut(doc, names.postcardFeedback, feedbackItems);

  const editHistoryRows = await prisma.postcardEditHistory.findMany();
  const editHistoryItems = editHistoryRows.map((row) => normalize(row));
  console.log(`postcardEditHistory: ${editHistoryItems.length}`);
  await batchPut(doc, names.postcardEditHistory, editHistoryItems);

  const reportCases = await prisma.postcardReportCase.findMany();
  const reportCaseItems = reportCases.map((row) => normalize(row));
  console.log(`postcardReportCases: ${reportCaseItems.length}`);
  await batchPut(doc, names.postcardReportCases, reportCaseItems);

  const reports = await prisma.postcardReport.findMany();
  const reportItems = reports.map((row) => {
    const normalized = normalize(row);
    return {
      ...normalized,
      uniqueKey: `${normalized.postcardId}#${normalized.version}#${normalized.reporterUserId}`,
    };
  });
  console.log(`postcardReports: ${reportItems.length}`);
  await batchPut(doc, names.postcardReports, reportItems);

  const feedbackMessages = await prisma.feedbackMessage.findMany();
  const feedbackMessageItems = feedbackMessages.map((row) => normalize(row));
  console.log(`feedbackMessages: ${feedbackMessageItems.length}`);
  await batchPut(doc, names.feedbackMessages, feedbackMessageItems);

  const userActionLogs = await prisma.userActionLog.findMany();
  const userActionLogItems = userActionLogs.map((row) => normalize(row));
  console.log(`userActionLogs: ${userActionLogItems.length}`);
  await batchPut(doc, names.userActionLogs, userActionLogItems);

  await prisma.$disconnect();
  console.log("migration complete");
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
