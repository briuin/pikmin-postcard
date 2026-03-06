import {
  BatchGetCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb';

type Row = Record<string, unknown>;

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resolveAttrName(
  raw: string,
  names: Record<string, string> | undefined
): string {
  if (raw.startsWith('#') && names?.[raw]) {
    return names[raw];
  }
  return raw.replace(/^#/, '');
}

function compareValues(left: unknown, right: unknown): number {
  const leftValue = left ?? '';
  const rightValue = right ?? '';
  if (typeof leftValue === 'number' && typeof rightValue === 'number') {
    return leftValue - rightValue;
  }
  return String(leftValue).localeCompare(String(rightValue));
}

function parseIndexRangeKey(indexName: string | undefined): string | null {
  if (!indexName) {
    return null;
  }
  const match = indexName.match(/^([A-Za-z0-9_]+)-([A-Za-z0-9_]+)-index$/);
  if (!match) {
    return null;
  }
  return match[2];
}

export class FakeDynamoDocClient {
  private readonly tables = new Map<string, Map<string, Row>>();

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [tableName, rows] of Object.entries(seed)) {
      const map = new Map<string, Row>();
      for (const row of rows) {
        const id = String(row.id || '');
        if (!id) {
          continue;
        }
        map.set(id, deepClone(row));
      }
      this.tables.set(tableName, map);
    }
  }

  getTableRows(tableName: string): Row[] {
    const table = this.tables.get(tableName);
    if (!table) {
      return [];
    }
    return [...table.values()].map((row) => deepClone(row));
  }

  getById(tableName: string, id: string): Row | null {
    const table = this.tables.get(tableName);
    if (!table) {
      return null;
    }
    const row = table.get(id);
    return row ? deepClone(row) : null;
  }

  async send(command: unknown): Promise<Record<string, unknown>> {
    if (command instanceof PutCommand) {
      const input = command.input as {
        TableName: string;
        Item: Row;
      };
      const table = this.ensureTable(input.TableName);
      const id = String(input.Item.id || '');
      if (!id) {
        throw new Error(`PutCommand missing id for table ${input.TableName}`);
      }
      table.set(id, deepClone(input.Item));
      return {};
    }

    if (command instanceof GetCommand) {
      const input = command.input as {
        TableName: string;
        Key: { id: string };
      };
      const table = this.ensureTable(input.TableName);
      const row = table.get(String(input.Key.id || ''));
      return {
        Item: row ? deepClone(row) : undefined
      };
    }

    if (command instanceof DeleteCommand) {
      const input = command.input as {
        TableName: string;
        Key: { id: string };
      };
      const table = this.ensureTable(input.TableName);
      table.delete(String(input.Key.id || ''));
      return {};
    }

    if (command instanceof ScanCommand) {
      const input = command.input as {
        TableName: string;
      };
      const table = this.ensureTable(input.TableName);
      return {
        Items: [...table.values()].map((row) => deepClone(row))
      };
    }

    if (command instanceof BatchGetCommand) {
      const input = command.input as {
        RequestItems: Record<string, { Keys: Array<{ id: string }> }>;
      };
      const responses: Record<string, Row[]> = {};
      for (const [tableName, request] of Object.entries(input.RequestItems || {})) {
        const table = this.ensureTable(tableName);
        responses[tableName] = (request.Keys || [])
          .map((key) => table.get(String(key.id || '')))
          .filter((row): row is Row => Boolean(row))
          .map((row) => deepClone(row));
      }
      return {
        Responses: responses
      };
    }

    if (command instanceof QueryCommand) {
      const input = command.input as {
        TableName: string;
        IndexName?: string;
        KeyConditionExpression?: string;
        ExpressionAttributeNames?: Record<string, string>;
        ExpressionAttributeValues?: Record<string, unknown>;
        ScanIndexForward?: boolean;
        Limit?: number;
      };
      const table = this.ensureTable(input.TableName);
      const rows = [...table.values()];

      const matcher = input.KeyConditionExpression?.match(
        /^\s*(#[A-Za-z0-9_]+)\s*=\s*(:[A-Za-z0-9_]+)\s*$/
      );
      let filtered = rows;
      if (matcher) {
        const attrName = resolveAttrName(matcher[1], input.ExpressionAttributeNames);
        const valueRef = matcher[2];
        const expected = input.ExpressionAttributeValues?.[valueRef];
        filtered = rows.filter((row) => row[attrName] === expected);
      }

      const rangeKey = parseIndexRangeKey(input.IndexName);
      if (rangeKey) {
        filtered.sort((left, right) => compareValues(left[rangeKey], right[rangeKey]));
        if (input.ScanIndexForward === false) {
          filtered.reverse();
        }
      }

      const limited =
        typeof input.Limit === 'number' && input.Limit >= 0
          ? filtered.slice(0, input.Limit)
          : filtered;

      return {
        Items: limited.map((row) => deepClone(row))
      };
    }

    if (command instanceof UpdateCommand) {
      const input = command.input as {
        TableName: string;
        Key: { id: string };
        UpdateExpression?: string;
        ExpressionAttributeNames?: Record<string, string>;
        ExpressionAttributeValues?: Record<string, unknown>;
      };
      const table = this.ensureTable(input.TableName);
      const id = String(input.Key.id || '');
      const current = deepClone(table.get(id) ?? { id });
      const expression = String(input.UpdateExpression || '').trim();
      const names = input.ExpressionAttributeNames || {};
      const values = input.ExpressionAttributeValues || {};

      if (
        expression.startsWith('SET #f = if_not_exists(#f, :zero) + :delta')
      ) {
        const fieldName = resolveAttrName('#f', names);
        const currentValue = Number(current[fieldName] ?? values[':zero'] ?? 0);
        const delta = Number(values[':delta'] ?? 0);
        current[fieldName] = currentValue + delta;
        if (values[':updatedAt'] !== undefined) {
          current.updatedAt = values[':updatedAt'];
        }
      } else if (expression.startsWith('SET ')) {
        const assignments = expression.slice(4).split(',');
        for (const assignment of assignments) {
          const match = assignment.match(/^\s*([#A-Za-z0-9_]+)\s*=\s*(:[A-Za-z0-9_]+)\s*$/);
          if (!match) {
            continue;
          }
          const field = resolveAttrName(match[1], names);
          const valueRef = match[2];
          current[field] = values[valueRef];
        }
      }

      table.set(id, current);
      return {
        Attributes: deepClone(current)
      };
    }

    throw new Error(`Unsupported command type: ${(command as { constructor?: { name?: string } })?.constructor?.name || 'unknown'}`);
  }

  private ensureTable(tableName: string): Map<string, Row> {
    if (!this.tables.has(tableName)) {
      this.tables.set(tableName, new Map<string, Row>());
    }
    return this.tables.get(tableName)!;
  }
}
