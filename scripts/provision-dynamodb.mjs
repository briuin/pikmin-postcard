import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import { getTableDefinitions } from "./dynamo-tables.mjs";

function getArg(name, fallback) {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return fallback;
}

async function ensureTable(client, definition) {
  try {
    await client.send(new DescribeTableCommand({ TableName: definition.TableName }));
    console.log(`exists: ${definition.TableName}`);
    return;
  } catch (error) {
    if (error.name !== "ResourceNotFoundException") {
      throw error;
    }
  }

  console.log(`creating: ${definition.TableName}`);
  await client.send(new CreateTableCommand(definition));
  await waitUntilTableExists(
    { client, maxWaitTime: 300 },
    { TableName: definition.TableName }
  );
  console.log(`ready: ${definition.TableName}`);
}

async function main() {
  const region = getArg("region", process.env.AWS_REGION || "us-east-1");
  const prefix = getArg(
    "prefix",
    String(process.env.DDB_TABLE_PREFIX || "pikmin-postcard-dev").trim() || "pikmin-postcard-dev"
  );
  const client = new DynamoDBClient({ region });

  console.log(`region=${region}`);
  console.log(`prefix=${prefix}`);

  const definitions = getTableDefinitions(prefix);
  for (const definition of definitions) {
    await ensureTable(client, definition);
  }

  console.log("done");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
