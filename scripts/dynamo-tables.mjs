export function getTableNames(prefix = "pikmin-postcard-dev") {
  return {
    users: `${prefix}-users`,
    inviteCodes: `${prefix}-invite-codes`,
    appSettings: `${prefix}-app-settings`,
    plantPaths: `${prefix}-plant-paths`,
    plantPathSaves: `${prefix}-plant-path-saves`,
    postcards: `${prefix}-postcards`,
    postcardsExplore: `${prefix}-postcards-explore`,
    tags: `${prefix}-tags`,
    postcardTags: `${prefix}-postcard-tags`,
    detectionJobs: `${prefix}-detection-jobs`,
    postcardFeedback: `${prefix}-postcard-feedback`,
    postcardEditHistory: `${prefix}-postcard-edit-history`,
    postcardReportCases: `${prefix}-postcard-report-cases`,
    postcardReports: `${prefix}-postcard-reports`,
    feedbackMessages: `${prefix}-feedback-messages`,
    userActionLogs: `${prefix}-user-action-logs`,
  };
}

function simpleTable(tableName, hashKey, extra = {}) {
  return {
    TableName: tableName,
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: [{ AttributeName: hashKey, AttributeType: "S" }],
    KeySchema: [{ AttributeName: hashKey, KeyType: "HASH" }],
    ...extra,
  };
}

export function getTableDefinitions(prefix = "pikmin-postcard-dev") {
  const names = getTableNames(prefix);

  return [
    simpleTable(names.users, "id", {
      AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" },
        { AttributeName: "email", AttributeType: "S" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "email-index",
          KeySchema: [{ AttributeName: "email", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    }),
    simpleTable(names.inviteCodes, "id"),
    simpleTable(names.appSettings, "id"),
    simpleTable(names.plantPaths, "id"),
    simpleTable(names.plantPathSaves, "id"),
    simpleTable(names.postcards, "id", {
      AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" },
        { AttributeName: "userId", AttributeType: "S" },
        { AttributeName: "createdAt", AttributeType: "S" },
        { AttributeName: "geoBucket", AttributeType: "S" },
        { AttributeName: "geoBucketMedium", AttributeType: "S" },
        { AttributeName: "geoBucketCoarse", AttributeType: "S" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "userId-createdAt-index",
          KeySchema: [
            { AttributeName: "userId", KeyType: "HASH" },
            { AttributeName: "createdAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: "geoBucket-createdAt-index",
          KeySchema: [
            { AttributeName: "geoBucket", KeyType: "HASH" },
            { AttributeName: "createdAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: "geoBucketMedium-createdAt-index",
          KeySchema: [
            { AttributeName: "geoBucketMedium", KeyType: "HASH" },
            { AttributeName: "createdAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: "geoBucketCoarse-createdAt-index",
          KeySchema: [
            { AttributeName: "geoBucketCoarse", KeyType: "HASH" },
            { AttributeName: "createdAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    }),
    simpleTable(names.postcardsExplore, "id", {
      AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" },
        { AttributeName: "createdAt", AttributeType: "S" },
        { AttributeName: "geoBucket", AttributeType: "S" },
        { AttributeName: "geoBucketMedium", AttributeType: "S" },
        { AttributeName: "geoBucketCoarse", AttributeType: "S" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "geoBucket-createdAt-index",
          KeySchema: [
            { AttributeName: "geoBucket", KeyType: "HASH" },
            { AttributeName: "createdAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: "geoBucketMedium-createdAt-index",
          KeySchema: [
            { AttributeName: "geoBucketMedium", KeyType: "HASH" },
            { AttributeName: "createdAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: "geoBucketCoarse-createdAt-index",
          KeySchema: [
            { AttributeName: "geoBucketCoarse", KeyType: "HASH" },
            { AttributeName: "createdAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    }),
    simpleTable(names.tags, "id", {
      AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" },
        { AttributeName: "name", AttributeType: "S" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "name-index",
          KeySchema: [{ AttributeName: "name", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    }),
    simpleTable(names.postcardTags, "id", {
      AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" },
        { AttributeName: "postcardId", AttributeType: "S" },
        { AttributeName: "tagId", AttributeType: "S" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "postcardId-index",
          KeySchema: [{ AttributeName: "postcardId", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: "tagId-index",
          KeySchema: [{ AttributeName: "tagId", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    }),
    simpleTable(names.detectionJobs, "id", {
      AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" },
        { AttributeName: "userId", AttributeType: "S" },
        { AttributeName: "status", AttributeType: "S" },
        { AttributeName: "createdAt", AttributeType: "S" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "userId-createdAt-index",
          KeySchema: [
            { AttributeName: "userId", KeyType: "HASH" },
            { AttributeName: "createdAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: "status-createdAt-index",
          KeySchema: [
            { AttributeName: "status", KeyType: "HASH" },
            { AttributeName: "createdAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    }),
    simpleTable(names.postcardFeedback, "id", {
      AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" },
        { AttributeName: "postcardId", AttributeType: "S" },
        { AttributeName: "userId", AttributeType: "S" },
        { AttributeName: "createdAt", AttributeType: "S" },
        { AttributeName: "uniqueKey", AttributeType: "S" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "postcardId-createdAt-index",
          KeySchema: [
            { AttributeName: "postcardId", KeyType: "HASH" },
            { AttributeName: "createdAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: "userId-createdAt-index",
          KeySchema: [
            { AttributeName: "userId", KeyType: "HASH" },
            { AttributeName: "createdAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: "uniqueKey-index",
          KeySchema: [{ AttributeName: "uniqueKey", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    }),
    simpleTable(names.postcardEditHistory, "id", {
      AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" },
        { AttributeName: "postcardId", AttributeType: "S" },
        { AttributeName: "userId", AttributeType: "S" },
        { AttributeName: "createdAt", AttributeType: "S" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "postcardId-createdAt-index",
          KeySchema: [
            { AttributeName: "postcardId", KeyType: "HASH" },
            { AttributeName: "createdAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: "userId-createdAt-index",
          KeySchema: [
            { AttributeName: "userId", KeyType: "HASH" },
            { AttributeName: "createdAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    }),
    simpleTable(names.postcardReportCases, "id", {
      AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" },
        { AttributeName: "status", AttributeType: "S" },
        { AttributeName: "updatedAt", AttributeType: "S" },
        { AttributeName: "postcardId", AttributeType: "S" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "status-updatedAt-index",
          KeySchema: [
            { AttributeName: "status", KeyType: "HASH" },
            { AttributeName: "updatedAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: "postcardId-updatedAt-index",
          KeySchema: [
            { AttributeName: "postcardId", KeyType: "HASH" },
            { AttributeName: "updatedAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    }),
    simpleTable(names.postcardReports, "id", {
      AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" },
        { AttributeName: "caseId", AttributeType: "S" },
        { AttributeName: "reporterUserId", AttributeType: "S" },
        { AttributeName: "createdAt", AttributeType: "S" },
        { AttributeName: "uniqueKey", AttributeType: "S" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "caseId-createdAt-index",
          KeySchema: [
            { AttributeName: "caseId", KeyType: "HASH" },
            { AttributeName: "createdAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: "reporterUserId-createdAt-index",
          KeySchema: [
            { AttributeName: "reporterUserId", KeyType: "HASH" },
            { AttributeName: "createdAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: "uniqueKey-index",
          KeySchema: [{ AttributeName: "uniqueKey", KeyType: "HASH" }],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    }),
    simpleTable(names.feedbackMessages, "id", {
      AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" },
        { AttributeName: "userId", AttributeType: "S" },
        { AttributeName: "status", AttributeType: "S" },
        { AttributeName: "createdAt", AttributeType: "S" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "userId-createdAt-index",
          KeySchema: [
            { AttributeName: "userId", KeyType: "HASH" },
            { AttributeName: "createdAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: "status-createdAt-index",
          KeySchema: [
            { AttributeName: "status", KeyType: "HASH" },
            { AttributeName: "createdAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    }),
    simpleTable(names.userActionLogs, "id", {
      AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" },
        { AttributeName: "userId", AttributeType: "S" },
        { AttributeName: "action", AttributeType: "S" },
        { AttributeName: "createdAt", AttributeType: "S" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "userId-createdAt-index",
          KeySchema: [
            { AttributeName: "userId", KeyType: "HASH" },
            { AttributeName: "createdAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: "action-createdAt-index",
          KeySchema: [
            { AttributeName: "action", KeyType: "HASH" },
            { AttributeName: "createdAt", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    }),
  ];
}
