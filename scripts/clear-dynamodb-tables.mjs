import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { getTableNames } from "./dynamo-tables.mjs";

function getArg(name, fallback) {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return fallback;
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function deleteBatch(doc, tableName, keys) {
  const groups = chunk(keys, 25);
  for (const group of groups) {
    let requestItems = {
      [tableName]: group.map((Key) => ({ DeleteRequest: { Key } })),
    };

    let retries = 0;
    while (Object.keys(requestItems).length > 0) {
      const res = await doc.send(new BatchWriteCommand({ RequestItems: requestItems }));
      requestItems = res.UnprocessedItems ?? {};
      if (Object.keys(requestItems).length > 0) {
        retries += 1;
        if (retries > 10) throw new Error(`Too many retries deleting from ${tableName}`);
        await new Promise((r) => setTimeout(r, 100 * retries));
      }
    }
  }
}

async function clearTable(doc, tableName) {
  let lastKey;
  let total = 0;
  do {
    const res = await doc.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: "#id",
        ExpressionAttributeNames: { "#id": "id" },
        ExclusiveStartKey: lastKey,
      })
    );

    const items = res.Items || [];
    if (items.length > 0) {
      const keys = items.map((item) => ({ id: item.id }));
      await deleteBatch(doc, tableName, keys);
      total += keys.length;
    }

    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  console.log(`cleared ${tableName}: ${total}`);
}

async function main() {
  const region = getArg("region", process.env.AWS_REGION || "us-east-1");
  const prefix = getArg("prefix", process.env.DDB_TABLE_PREFIX || "pikmin-postcard");

  const tables = Object.values(getTableNames(prefix));
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

  for (const tableName of tables) {
    await clearTable(doc, tableName);
  }

  console.log("all tables cleared");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
