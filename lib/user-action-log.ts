import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddbDoc, ddbTables, newId, nowIso } from '@/lib/repos/dynamodb/shared';

type RecordUserActionInput = {
  request: Request;
  userId: string;
  action: string;
  metadata?: Record<string, unknown> | Array<unknown> | string | number | boolean | null;
};

export function buildUploadedFileActionMetadata(
  file: File
): Record<string, string | number> {
  return {
    fileName: file.name,
    mimeType: file.type,
    size: file.size
  };
}

function firstNonEmptyValue(values: Array<string | null>): string | null {
  for (const value of values) {
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function extractClientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded
      .split(',')
      .map((part) => part.trim())
      .find((part) => part.length > 0);
    if (first) {
      return first.slice(0, 120);
    }
  }

  const direct = firstNonEmptyValue([
    request.headers.get('x-real-ip'),
    request.headers.get('cf-connecting-ip'),
    request.headers.get('true-client-ip')
  ]);
  return direct ? direct.slice(0, 120) : null;
}

function extractPath(request: Request): string {
  try {
    const url = new URL(request.url);
    const pathWithQuery = `${url.pathname}${url.search}`;
    return pathWithQuery.slice(0, 500);
  } catch {
    return request.url.slice(0, 500);
  }
}

export async function recordUserAction(input: RecordUserActionInput): Promise<void> {
  try {
    await ddbDoc.send(
      new PutCommand({
        TableName: ddbTables.userActionLogs,
        Item: {
          id: newId('ual'),
          userId: input.userId,
          action: input.action.slice(0, 120),
          method: input.request.method.slice(0, 20),
          path: extractPath(input.request),
          ipAddress: extractClientIp(input.request),
          userAgent: input.request.headers.get('user-agent')?.slice(0, 500) ?? null,
          metadata: input.metadata ?? null,
          createdAt: nowIso()
        }
      })
    );
  } catch (error) {
    console.error('Failed to record user action log', {
      action: input.action,
      userId: input.userId,
      error
    });
  }
}
