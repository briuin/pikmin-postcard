import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  UpdateTableCommand,
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
  let existingDescription = null;
  try {
    const describe = await client.send(
      new DescribeTableCommand({ TableName: definition.TableName })
    );
    existingDescription = describe.Table || null;
    console.log(`exists: ${definition.TableName}`);
  } catch (error) {
    if (error.name !== "ResourceNotFoundException") {
      throw error;
    }
    console.log(`creating: ${definition.TableName}`);
    await client.send(new CreateTableCommand(definition));
    await waitUntilTableExists(
      { client, maxWaitTime: 300 },
      { TableName: definition.TableName }
    );
    const describe = await client.send(
      new DescribeTableCommand({ TableName: definition.TableName })
    );
    existingDescription = describe.Table || null;
    console.log(`ready: ${definition.TableName}`);
  }

  await ensureMissingGlobalSecondaryIndexes(client, definition, existingDescription);
}

async function waitForTableReady(client, tableName) {
  for (let attempts = 0; attempts < 120; attempts += 1) {
    const describe = await client.send(
      new DescribeTableCommand({ TableName: tableName })
    );
    if (describe.Table?.TableStatus === "ACTIVE") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(
    `Timed out waiting for table ${tableName} to become ACTIVE after index update.`
  );
}

function resolveAttributeDefinitionMap(attributeDefinitions = []) {
  const map = new Map();
  for (const definition of attributeDefinitions) {
    if (!definition?.AttributeName) {
      continue;
    }
    map.set(definition.AttributeName, definition);
  }
  return map;
}

async function ensureMissingGlobalSecondaryIndexes(client, definition, existingTable) {
  const desiredIndexes = definition.GlobalSecondaryIndexes || [];
  if (desiredIndexes.length === 0) {
    return;
  }

  const existingIndexNames = new Set(
    (existingTable?.GlobalSecondaryIndexes || []).map((index) => index.IndexName)
  );
  const existingAttrDefs = resolveAttributeDefinitionMap(
    existingTable?.AttributeDefinitions || []
  );
  const desiredAttrDefs = resolveAttributeDefinitionMap(
    definition.AttributeDefinitions || []
  );

  for (const index of desiredIndexes) {
    if (!index?.IndexName || existingIndexNames.has(index.IndexName)) {
      continue;
    }

    const updateAttrDefs = [];
    const seenUpdateAttrNames = new Set();
    for (const keyPart of index.KeySchema || []) {
      const attrName = keyPart.AttributeName;
      if (!attrName) {
        continue;
      }
      const attrDef = desiredAttrDefs.get(attrName) || existingAttrDefs.get(attrName);
      if (!attrDef) {
        throw new Error(
          `Missing AttributeDefinition for ${attrName} on ${definition.TableName}.`
        );
      }
      if (!seenUpdateAttrNames.has(attrName)) {
        updateAttrDefs.push(attrDef);
        seenUpdateAttrNames.add(attrName);
      }
      existingAttrDefs.set(attrName, attrDef);
    }

    console.log(`adding GSI ${index.IndexName} on ${definition.TableName}`);
    await client.send(
      new UpdateTableCommand({
        TableName: definition.TableName,
        AttributeDefinitions: updateAttrDefs,
        GlobalSecondaryIndexUpdates: [
          {
            Create: {
              IndexName: index.IndexName,
              KeySchema: index.KeySchema,
              Projection: index.Projection,
            },
          },
        ],
      })
    );
    await waitForTableReady(client, definition.TableName);
    existingIndexNames.add(index.IndexName);
    console.log(`GSI ready: ${definition.TableName}/${index.IndexName}`);
  }
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
