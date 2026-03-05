import { PrismaClient } from "@prisma/client";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { getTableNames } from "./dynamo-tables.mjs";

function getArg(name, fallback) {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return fallback;
}

async function countAll(doc, tableName) {
  let total = 0;
  let ExclusiveStartKey;

  do {
    const res = await doc.send(
      new ScanCommand({
        TableName: tableName,
        Select: "COUNT",
        ExclusiveStartKey,
      })
    );
    total += res.Count ?? 0;
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return total;
}

async function main() {
  const region = getArg("region", process.env.AWS_REGION || "us-east-1");
  const prefix = getArg("prefix", process.env.DDB_TABLE_PREFIX || "pikmin-postcard");

  const names = getTableNames(prefix);
  const prisma = new PrismaClient();
  const ddb = new DynamoDBClient({ region });
  const doc = DynamoDBDocumentClient.from(ddb);

  const checks = [
    ["users", () => prisma.user.count()],
    ["postcards", () => prisma.postcard.count()],
    ["tags", () => prisma.tag.count()],
    ["postcardTags", () => prisma.postcardTag.count()],
    ["detectionJobs", () => prisma.detectionJob.count()],
    ["postcardFeedback", () => prisma.postcardFeedback.count()],
    ["postcardEditHistory", () => prisma.postcardEditHistory.count()],
    ["postcardReportCases", () => prisma.postcardReportCase.count()],
    ["postcardReports", () => prisma.postcardReport.count()],
    ["feedbackMessages", () => prisma.feedbackMessage.count()],
    ["userActionLogs", () => prisma.userActionLog.count()],
  ];

  let ok = true;

  for (const [key, prismaCountFn] of checks) {
    const expected = await prismaCountFn();
    const actual = await countAll(doc, names[key]);
    const pass = expected === actual;
    if (!pass) ok = false;
    console.log(`${key}: prisma=${expected} dynamodb=${actual} ${pass ? "OK" : "MISMATCH"}`);
  }

  await prisma.$disconnect();

  if (!ok) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
