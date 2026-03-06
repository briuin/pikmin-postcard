import crypto from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand
} from '@aws-sdk/lib-dynamodb';

const region = process.env.AWS_REGION || process.env.S3_REGION || 'us-east-1';
const tablePrefix =
  String(process.env.DDB_TABLE_PREFIX || 'pikmin-postcard-dev').trim() || 'pikmin-postcard-dev';

export const ddbTables = {
  users: `${tablePrefix}-users`,
  postcards: `${tablePrefix}-postcards`,
  tags: `${tablePrefix}-tags`,
  postcardTags: `${tablePrefix}-postcard-tags`,
  detectionJobs: `${tablePrefix}-detection-jobs`,
  postcardFeedback: `${tablePrefix}-postcard-feedback`,
  postcardEditHistory: `${tablePrefix}-postcard-edit-history`,
  postcardReportCases: `${tablePrefix}-postcard-report-cases`,
  postcardReports: `${tablePrefix}-postcard-reports`,
  feedbackMessages: `${tablePrefix}-feedback-messages`,
  userActionLogs: `${tablePrefix}-user-action-logs`
} as const;

export const ddbDoc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true }
});

export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeEmail(email: string | null | undefined): string {
  return String(email || '').trim().toLowerCase();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function toDateOrNull(value: unknown): Date | null {
  const iso = toIsoOrNull(value);
  return iso ? new Date(iso) : null;
}

export function normalizeSearchText(text: string | null | undefined): string {
  return String(text || '').trim().toLowerCase();
}

export function includesKeyword(values: Array<unknown>, keyword: string): boolean {
  if (!keyword) {
    return true;
  }
  const haystack = values
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => value.length > 0)
    .join(' ');
  return haystack.includes(keyword);
}

export async function scanAll(tableName: string): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await ddbDoc.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lastKey
      })
    );

    if (Array.isArray(result.Items)) {
      items.push(...(result.Items as Record<string, unknown>[]));
    }
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return items;
}

export async function queryAllByIndex(params: {
  tableName: string;
  indexName: string;
  keyExpression: string;
  attrNames: Record<string, string>;
  attrValues: Record<string, unknown>;
  scanIndexForward?: boolean;
  limit?: number;
}): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await ddbDoc.send(
      new QueryCommand({
        TableName: params.tableName,
        IndexName: params.indexName,
        KeyConditionExpression: params.keyExpression,
        ExpressionAttributeNames: params.attrNames,
        ExpressionAttributeValues: params.attrValues,
        ScanIndexForward: params.scanIndexForward ?? true,
        ExclusiveStartKey: lastKey
      })
    );

    if (Array.isArray(result.Items)) {
      items.push(...(result.Items as Record<string, unknown>[]));
    }
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;

    if (params.limit && items.length >= params.limit) {
      return items.slice(0, params.limit);
    }
  } while (lastKey);

  return items;
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < list.length; index += size) {
    out.push(list.slice(index, index + size));
  }
  return out;
}

export async function batchGetByIds(
  tableName: string,
  ids: Array<string | null | undefined>
): Promise<Record<string, unknown>[]> {
  const normalized = Array.from(
    new Set(
      ids
        .map((id) => String(id || '').trim())
        .filter((id) => id.length > 0)
    )
  );
  if (normalized.length === 0) {
    return [];
  }

  const rows: Record<string, unknown>[] = [];
  for (const idChunk of chunk(normalized, 100)) {
    let requestItems: Record<string, { Keys: Array<Record<string, string>> }> | undefined = {
      [tableName]: {
        Keys: idChunk.map((id) => ({ id }))
      }
    };

    let retries = 0;
    while (requestItems && Object.keys(requestItems).length > 0) {
      const result = await ddbDoc.send(
        new BatchGetCommand({
          RequestItems: requestItems
        })
      );
      const fetched = result.Responses?.[tableName] ?? [];
      rows.push(...(fetched as Record<string, unknown>[]));

      requestItems = result.UnprocessedKeys as
        | Record<string, { Keys: Array<Record<string, string>> }>
        | undefined;
      if (requestItems && Object.keys(requestItems).length > 0) {
        retries += 1;
        if (retries > 8) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 80 * retries));
      }
    }
  }

  return rows;
}
