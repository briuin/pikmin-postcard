import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { PostcardReportStatus } from '@prisma/client';
import {
  batchGetByIds,
  ddbDoc,
  ddbTables,
  includesKeyword,
  normalizeSearchText,
  nowIso,
  queryAllByIndex,
  scanAll,
  toDateOrNull,
  toIsoOrNull
} from '@/lib/repos/dynamodb/shared';
import {
  buildReasonCounts,
  getReporterName,
  type ActiveReportCaseDetail,
  type AdminReportCaseRecord,
  type DashboardReportListItem,
  type ReportCaseStatusUpdateResult
} from '@/lib/postcards/report-types';
import type { CancelDashboardReportResult, ReportRepo } from '@/lib/repos/reports/types';

type UnknownRecord = Record<string, unknown>;

type DynamoPostcardRow = {
  id: string;
  userId: string;
  title: string;
  imageUrl: string | null;
  placeName: string | null;
  deletedAt: string | null;
  wrongLocationReports: number;
  reportVersion: number;
};

type DynamoReportCaseRow = {
  id: string;
  postcardId: string;
  version: number;
  status: PostcardReportStatus;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
};

type DynamoReportRow = {
  id: string;
  postcardId: string;
  version: number;
  caseId: string;
  reporterUserId: string;
  reason: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

type DynamoUserRow = {
  id: string;
  email: string;
  displayName: string | null;
};

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeReportStatus(value: unknown): PostcardReportStatus {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  if (
    normalized === PostcardReportStatus.PENDING ||
    normalized === PostcardReportStatus.IN_PROGRESS ||
    normalized === PostcardReportStatus.VERIFIED ||
    normalized === PostcardReportStatus.REMOVED
  ) {
    return normalized;
  }
  return PostcardReportStatus.PENDING;
}

function toPostcardRow(item: UnknownRecord | null | undefined): DynamoPostcardRow | null {
  if (!item) {
    return null;
  }
  const id = String(item.id || '').trim();
  const userId = String(item.userId || '').trim();
  const title = String(item.title || '').trim();
  if (!id || !userId || !title) {
    return null;
  }

  return {
    id,
    userId,
    title,
    imageUrl: toNullableString(item.imageUrl),
    placeName: toNullableString(item.placeName),
    deletedAt: toNullableString(item.deletedAt),
    wrongLocationReports: toNumber(item.wrongLocationReports, 0),
    reportVersion: toNumber(item.reportVersion, 1)
  };
}

function toReportCaseRow(item: UnknownRecord | null | undefined): DynamoReportCaseRow | null {
  if (!item) {
    return null;
  }
  const id = String(item.id || '').trim();
  const postcardId = String(item.postcardId || '').trim();
  if (!id || !postcardId) {
    return null;
  }
  return {
    id,
    postcardId,
    version: toNumber(item.version, 1),
    status: normalizeReportStatus(item.status),
    adminNote: toNullableString(item.adminNote),
    createdAt: toIsoOrNull(item.createdAt) ?? nowIso(),
    updatedAt: toIsoOrNull(item.updatedAt) ?? nowIso(),
    resolvedAt: toIsoOrNull(item.resolvedAt),
    resolvedByUserId: toNullableString(item.resolvedByUserId)
  };
}

function toReportRow(item: UnknownRecord | null | undefined): DynamoReportRow | null {
  if (!item) {
    return null;
  }
  const id = String(item.id || '').trim();
  const postcardId = String(item.postcardId || '').trim();
  const caseId = String(item.caseId || '').trim();
  const reporterUserId = String(item.reporterUserId || '').trim();
  if (!id || !postcardId || !caseId || !reporterUserId) {
    return null;
  }

  return {
    id,
    postcardId,
    version: toNumber(item.version, 1),
    caseId,
    reporterUserId,
    reason: String(item.reason || 'WRONG_LOCATION'),
    description: toNullableString(item.description),
    createdAt: toIsoOrNull(item.createdAt) ?? nowIso(),
    updatedAt: toIsoOrNull(item.updatedAt) ?? nowIso()
  };
}

function toUserRow(item: UnknownRecord | null | undefined): DynamoUserRow | null {
  if (!item) {
    return null;
  }
  const id = String(item.id || '').trim();
  const email = String(item.email || '').trim().toLowerCase();
  if (!id || !email) {
    return null;
  }
  return {
    id,
    email,
    displayName: toNullableString(item.displayName)
  };
}

async function buildAdminReportCaseRecords(
  reportCases: DynamoReportCaseRow[],
  options: { reportTake?: number } = {}
): Promise<AdminReportCaseRecord[]> {
  if (reportCases.length === 0) {
    return [];
  }
  const reportTake = typeof options.reportTake === 'number' && options.reportTake > 0
    ? options.reportTake
    : undefined;

  const postcardIds = Array.from(new Set(reportCases.map((item) => item.postcardId)));
  const postcards = (await batchGetByIds(ddbTables.postcards, postcardIds))
    .map((item) => toPostcardRow(item))
    .filter((item): item is DynamoPostcardRow => Boolean(item));
  const postcardById = new Map(postcards.map((item) => [item.id, item]));

  const reportRowsByCaseId = new Map<string, DynamoReportRow[]>();
  for (const reportCase of reportCases) {
    const rows = await queryAllByIndex({
      tableName: ddbTables.postcardReports,
      indexName: 'caseId-createdAt-index',
      keyExpression: '#c = :c',
      attrNames: { '#c': 'caseId' },
      attrValues: { ':c': reportCase.id },
      scanIndexForward: false,
      limit: reportTake
    });
    reportRowsByCaseId.set(
      reportCase.id,
      rows.map((item) => toReportRow(item)).filter((item): item is DynamoReportRow => Boolean(item))
    );
  }

  const reporterUserIds = new Set<string>();
  const uploaderUserIds = new Set<string>();
  for (const reportRows of reportRowsByCaseId.values()) {
    for (const report of reportRows) {
      reporterUserIds.add(report.reporterUserId);
    }
  }
  for (const reportCase of reportCases) {
    const postcard = postcardById.get(reportCase.postcardId);
    if (postcard) {
      uploaderUserIds.add(postcard.userId);
    }
  }

  const users = (await batchGetByIds(ddbTables.users, [...reporterUserIds, ...uploaderUserIds]))
    .map((item) => toUserRow(item))
    .filter((item): item is DynamoUserRow => Boolean(item));
  const userById = new Map(users.map((item) => [item.id, item]));

  return reportCases.map((reportCase) => {
    const postcard = postcardById.get(reportCase.postcardId);
    const reportRows = reportRowsByCaseId.get(reportCase.id) ?? [];
    const reports = reportRows.map((report) => ({
      id: report.id,
      reason: report.reason,
      description: report.description,
      createdAt: toDateOrNull(report.createdAt) ?? new Date(),
      reporterName: getReporterName(userById.get(report.reporterUserId) ?? { email: '', displayName: null })
    }));

    return {
      caseId: reportCase.id,
      postcardId: reportCase.postcardId,
      version: reportCase.version,
      status: reportCase.status,
      adminNote: reportCase.adminNote,
      createdAt: toDateOrNull(reportCase.createdAt) ?? new Date(),
      updatedAt: toDateOrNull(reportCase.updatedAt) ?? new Date(),
      resolvedAt: toDateOrNull(reportCase.resolvedAt),
      postcard: {
        id: postcard?.id ?? reportCase.postcardId,
        title: postcard?.title ?? 'Unknown postcard',
        imageUrl: postcard?.imageUrl ?? null,
        placeName: postcard?.placeName ?? null,
        deletedAt: toDateOrNull(postcard?.deletedAt),
        wrongLocationReports: Number(postcard?.wrongLocationReports || 0),
        reportVersion: Number(postcard?.reportVersion || reportCase.version || 1),
        uploaderName: getReporterName(userById.get(postcard?.userId ?? '') ?? { email: '', displayName: null })
      },
      reportCount: reports.length,
      reasonCounts: buildReasonCounts(reports),
      reports
    };
  });
}

async function listDashboardReportsByReporter(userId: string): Promise<DashboardReportListItem[]> {
  const reports = await queryAllByIndex({
    tableName: ddbTables.postcardReports,
    indexName: 'reporterUserId-createdAt-index',
    keyExpression: '#u = :u',
    attrNames: { '#u': 'reporterUserId' },
    attrValues: { ':u': userId },
    scanIndexForward: false,
    limit: 300
  });
  const rows = reports.map((item) => toReportRow(item)).filter((item): item is DynamoReportRow => Boolean(item));
  if (rows.length === 0) {
    return [];
  }

  const [postcards, reportCases] = await Promise.all([
    batchGetByIds(ddbTables.postcards, rows.map((item) => item.postcardId)),
    batchGetByIds(ddbTables.postcardReportCases, rows.map((item) => item.caseId))
  ]);
  const postcardById = new Map(
    postcards
      .map((item) => toPostcardRow(item))
      .filter((item): item is DynamoPostcardRow => Boolean(item))
      .map((item) => [item.id, item])
  );
  const reportCaseById = new Map(
    reportCases
      .map((item) => toReportCaseRow(item))
      .filter((item): item is DynamoReportCaseRow => Boolean(item))
      .map((item) => [item.id, item])
  );

  return rows.map((report) => {
    const postcard = postcardById.get(report.postcardId);
    const reportCase = reportCaseById.get(report.caseId);
    return {
      reportId: report.id,
      caseId: report.caseId,
      postcardId: report.postcardId,
      postcardTitle: postcard?.title ?? 'Unknown postcard',
      postcardImageUrl: postcard?.imageUrl ?? null,
      postcardPlaceName: postcard?.placeName ?? null,
      postcardDeletedAt: toDateOrNull(postcard?.deletedAt),
      reportReason: report.reason,
      reportDescription: report.description,
      reportVersion: report.version,
      status: reportCase?.status ?? PostcardReportStatus.PENDING,
      adminNote: reportCase?.adminNote ?? null,
      reportedAt: toDateOrNull(report.createdAt) ?? new Date(),
      statusUpdatedAt: toDateOrNull(reportCase?.updatedAt) ?? toDateOrNull(report.updatedAt) ?? new Date()
    };
  });
}

async function cancelDashboardReport(params: {
  userId: string;
  reportId: string;
}): Promise<CancelDashboardReportResult> {
  const reportResult = await ddbDoc.send(
    new GetCommand({
      TableName: ddbTables.postcardReports,
      Key: { id: params.reportId }
    })
  );
  const report = toReportRow(reportResult.Item as UnknownRecord);
  if (!report || report.reporterUserId !== params.userId) {
    return { kind: 'not_found' };
  }

  const reportCaseResult = await ddbDoc.send(
    new GetCommand({
      TableName: ddbTables.postcardReportCases,
      Key: { id: report.caseId }
    })
  );
  const reportCase = toReportCaseRow(reportCaseResult.Item as UnknownRecord);
  if (reportCase && (reportCase.status === PostcardReportStatus.VERIFIED || reportCase.status === PostcardReportStatus.REMOVED)) {
    return { kind: 'resolved' };
  }

  await ddbDoc.send(
    new DeleteCommand({
      TableName: ddbTables.postcardReports,
      Key: { id: params.reportId }
    })
  );

  const postcardResult = await ddbDoc.send(
    new GetCommand({
      TableName: ddbTables.postcards,
      Key: { id: report.postcardId }
    })
  );
  const postcard = toPostcardRow(postcardResult.Item as UnknownRecord);
  if (
    postcard &&
    Number(report.version || 0) === Number(postcard.reportVersion || 0) &&
    Number(postcard.wrongLocationReports || 0) > 0
  ) {
    await ddbDoc.send(
      new UpdateCommand({
        TableName: ddbTables.postcards,
        Key: { id: postcard.id },
        UpdateExpression: 'SET wrongLocationReports = if_not_exists(wrongLocationReports, :zero) + :delta, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':zero': 0,
          ':delta': -1,
          ':updatedAt': nowIso()
        }
      })
    );
  }

  const remaining = await queryAllByIndex({
    tableName: ddbTables.postcardReports,
    indexName: 'caseId-createdAt-index',
    keyExpression: '#c = :c',
    attrNames: { '#c': 'caseId' },
    attrValues: { ':c': report.caseId },
    limit: 2
  });
  if (remaining.length === 0) {
    await ddbDoc.send(
      new DeleteCommand({
        TableName: ddbTables.postcardReportCases,
        Key: { id: report.caseId }
      })
    );
  }

  return {
    kind: 'deleted',
    postcardId: report.postcardId
  };
}

async function findActiveReportCaseDetailMapForPostcards(
  postcardIds: string[]
): Promise<Map<string, ActiveReportCaseDetail>> {
  const uniquePostcardIds = Array.from(new Set(postcardIds.map((id) => String(id)).filter(Boolean)));
  if (uniquePostcardIds.length === 0) {
    return new Map();
  }

  const postcardRows = (await batchGetByIds(ddbTables.postcards, uniquePostcardIds))
    .map((item) => toPostcardRow(item))
    .filter((item): item is DynamoPostcardRow => Boolean(item));
  const postcardById = new Map(postcardRows.map((item) => [item.id, item]));

  const selectedCases: DynamoReportCaseRow[] = [];
  for (const postcardId of uniquePostcardIds) {
    const postcard = postcardById.get(postcardId);
    if (!postcard) {
      continue;
    }
    const caseRows = await queryAllByIndex({
      tableName: ddbTables.postcardReportCases,
      indexName: 'postcardId-updatedAt-index',
      keyExpression: '#p = :p',
      attrNames: { '#p': 'postcardId' },
      attrValues: { ':p': postcardId },
      scanIndexForward: false
    });
    const matched = caseRows
      .map((item) => toReportCaseRow(item))
      .filter((item): item is DynamoReportCaseRow => Boolean(item))
      .find((item) => item.version === postcard.reportVersion);
    if (matched) {
      selectedCases.push(matched);
    }
  }

  const records = await buildAdminReportCaseRecords(selectedCases, { reportTake: 50 });
  const map = new Map<string, ActiveReportCaseDetail>();
  for (const record of records) {
    map.set(record.postcardId, {
      postcardId: record.postcardId,
      caseId: record.caseId,
      status: record.status,
      updatedAt: record.updatedAt,
      adminNote: record.adminNote,
      reportCount: record.reportCount,
      reasonCounts: record.reasonCounts,
      reports: record.reports
    });
  }
  return map;
}

async function listAdminReportCases(params: {
  status?: PostcardReportStatus;
  search?: string;
  limit: number;
  reportTake?: number;
}): Promise<AdminReportCaseRecord[]> {
  const reportCases = (await scanAll(ddbTables.postcardReportCases))
    .map((item) => toReportCaseRow(item))
    .filter((item): item is DynamoReportCaseRow => Boolean(item))
    .filter((item) => !params.status || item.status === params.status)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  const records = await buildAdminReportCaseRecords(reportCases, {
    reportTake: params.reportTake ?? 30
  });
  const keyword = normalizeSearchText(params.search);
  const filtered = records.filter((item) => {
    if (!keyword) {
      return true;
    }
    return includesKeyword(
      [
        item.postcard.title,
        item.postcard.placeName,
        item.postcard.uploaderName,
        ...item.reports.flatMap((report) => [report.description, report.reporterName, report.reason])
      ],
      keyword
    );
  });
  return filtered.slice(0, params.limit);
}

async function findAdminEditableReportCaseStateByPostcardId(
  postcardId: string
): Promise<PostcardReportStatus | null> {
  const postcardResult = await ddbDoc.send(
    new GetCommand({
      TableName: ddbTables.postcards,
      Key: { id: postcardId }
    })
  );
  const postcard = toPostcardRow(postcardResult.Item as UnknownRecord);
  if (!postcard) {
    return null;
  }

  const caseRows = await queryAllByIndex({
    tableName: ddbTables.postcardReportCases,
    indexName: 'postcardId-updatedAt-index',
    keyExpression: '#p = :p',
    attrNames: { '#p': 'postcardId' },
    attrValues: { ':p': postcardId },
    scanIndexForward: false
  });
  const matched = caseRows
    .map((item) => toReportCaseRow(item))
    .filter((item): item is DynamoReportCaseRow => Boolean(item))
    .find((item) => item.version === postcard.reportVersion);
  return matched?.status ?? null;
}

async function updateReportCaseStatus(params: {
  caseId: string;
  nextStatus: PostcardReportStatus;
  adminNote?: string | null;
  resolverUserId: string;
}): Promise<ReportCaseStatusUpdateResult | null> {
  const reportCaseResult = await ddbDoc.send(
    new GetCommand({
      TableName: ddbTables.postcardReportCases,
      Key: { id: params.caseId }
    })
  );
  const reportCase = toReportCaseRow(reportCaseResult.Item as UnknownRecord);
  if (!reportCase) {
    return null;
  }

  const postcardResult = await ddbDoc.send(
    new GetCommand({
      TableName: ddbTables.postcards,
      Key: { id: reportCase.postcardId }
    })
  );
  const postcard = toPostcardRow(postcardResult.Item as UnknownRecord);
  if (!postcard) {
    return null;
  }

  const timestamp = nowIso();
  const shouldResolve =
    params.nextStatus === PostcardReportStatus.VERIFIED ||
    params.nextStatus === PostcardReportStatus.REMOVED;
  const normalizedAdminNote = params.adminNote ? String(params.adminNote).trim().slice(0, 1200) || null : null;
  const updatedCase: UnknownRecord = {
    ...reportCase,
    status: params.nextStatus,
    adminNote: normalizedAdminNote,
    resolvedAt: shouldResolve ? timestamp : null,
    resolvedByUserId: shouldResolve ? params.resolverUserId : null,
    updatedAt: timestamp
  };
  await ddbDoc.send(
    new PutCommand({
      TableName: ddbTables.postcardReportCases,
      Item: updatedCase
    })
  );

  let updatedPostcard: DynamoPostcardRow = {
    ...postcard
  };
  if (
    params.nextStatus === PostcardReportStatus.VERIFIED &&
    Number(postcard.reportVersion || 0) === Number(reportCase.version || 0)
  ) {
    updatedPostcard = {
      ...updatedPostcard,
      wrongLocationReports: 0,
      reportVersion: Number(postcard.reportVersion || 0) + 1
    };
    await ddbDoc.send(
      new PutCommand({
        TableName: ddbTables.postcards,
        Item: {
          ...updatedPostcard,
          updatedAt: timestamp
        }
      })
    );
  } else if (params.nextStatus === PostcardReportStatus.REMOVED) {
    updatedPostcard = {
      ...updatedPostcard,
      wrongLocationReports: 0,
      deletedAt: updatedPostcard.deletedAt || timestamp
    };
    await ddbDoc.send(
      new PutCommand({
        TableName: ddbTables.postcards,
        Item: {
          ...updatedPostcard,
          updatedAt: timestamp
        }
      })
    );
  }

  return {
    caseId: reportCase.id,
    postcardId: updatedPostcard.id,
    status: params.nextStatus,
    reportVersion: Number(updatedPostcard.reportVersion || 1),
    wrongLocationReports: Number(updatedPostcard.wrongLocationReports || 0),
    postcardDeletedAt: toDateOrNull(updatedPostcard.deletedAt)
  };
}

async function findAdminReportCaseById(caseId: string): Promise<AdminReportCaseRecord | null> {
  const reportCaseResult = await ddbDoc.send(
    new GetCommand({
      TableName: ddbTables.postcardReportCases,
      Key: { id: caseId }
    })
  );
  const reportCase = toReportCaseRow(reportCaseResult.Item as UnknownRecord);
  if (!reportCase) {
    return null;
  }

  const [record] = await buildAdminReportCaseRecords([reportCase], { reportTake: 300 });
  return record ?? null;
}

export const dynamoReportRepo: ReportRepo = {
  listDashboardReportsByReporter,
  cancelDashboardReport,
  findActiveReportCaseDetailMapForPostcards,
  listAdminReportCases,
  findAdminEditableReportCaseStateByPostcardId,
  updateReportCaseStatus,
  findAdminReportCaseById
};
