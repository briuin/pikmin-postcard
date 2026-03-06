import { NextResponse } from 'next/server';
import { z } from 'zod';
import { FeedbackMessageStatus, PostcardReportStatus } from '@/lib/domain/enums';
import {
  saveAdminReportCaseStatus,
  withAdminReportStatusPatch
} from '@/lib/admin/report-route-helpers';
import { invalidQueryResponse, safeParseRequestQuery } from '@/lib/admin/route-helpers';
import {
  listAdminUsers,
  listUsersQuerySchema,
  updateAdminUserAccess,
  updateUserAccessSchema
} from '@/lib/admin/users';
import { serializePostcards } from '@/lib/postcards/list';
import { buildPostcardSearchFilter } from '@/lib/postcards/query';
import { findPostcardsForList } from '@/lib/postcards/repository';
import {
  findActiveReportCaseDetailMapForPostcards,
  findAdminReportCaseById,
  listAdminReportCases,
  serializeAdminReportCaseRecord
} from '@/lib/postcards/report-workflow';
import {
  batchGetByIds,
  ddbTables,
  includesKeyword,
  normalizeSearchText,
  scanAll
} from '@/lib/repos/dynamodb/shared';
import { recordUserAction } from '@/lib/user-action-log';

const adminPostcardQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  reportedOnly: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(500).default(240)
});

const adminFeedbackQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.nativeEnum(FeedbackMessageStatus).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(300)
});

const adminReportsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.nativeEnum(PostcardReportStatus).optional(),
  limit: z.coerce.number().int().min(1).max(400).default(200)
});

const adminReportStatusPatchSchema = z.object({
  caseId: z.string().trim().min(1),
  status: z.nativeEnum(PostcardReportStatus),
  adminNote: z.string().trim().max(1200).optional()
});

const adminReportCasePatchSchema = z.object({
  status: z.nativeEnum(PostcardReportStatus),
  adminNote: z.string().trim().max(1200).optional()
});

export async function listAdminUsersLocal(args: {
  request: Request;
  actorId: string;
}): Promise<NextResponse> {
  const parse = safeParseRequestQuery(args.request, (searchParams) =>
    listUsersQuerySchema.safeParse({
      q: searchParams.get('q') ?? undefined,
      role: searchParams.get('role') ?? undefined,
      limit: searchParams.get('limit') ?? undefined
    })
  );

  if (!parse.success) {
    return invalidQueryResponse(parse.error);
  }

  await recordUserAction({
    request: args.request,
    userId: args.actorId,
    action: 'ADMIN_USERS_LIST'
  });

  const users = await listAdminUsers(parse.data);
  return NextResponse.json(users, { status: 200 });
}

export async function updateAdminUserAccessLocal(args: {
  request: Request;
  actorId: string;
}): Promise<NextResponse> {
  try {
    const payload = updateUserAccessSchema.parse(await args.request.json());
    await recordUserAction({
      request: args.request,
      userId: args.actorId,
      action: 'ADMIN_USER_ACCESS_UPDATE',
      metadata: {
        targetUserId: payload.userId,
        targetRole: payload.role,
        approvalStatus: payload.approvalStatus,
        canCreatePostcard: payload.canCreatePostcard,
        canSubmitDetection: payload.canSubmitDetection,
        canVote: payload.canVote
      }
    });

    const result = await updateAdminUserAccess(payload);
    if (result.kind === 'not_found') {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }
    if (result.kind === 'bootstrap_role_locked') {
      return NextResponse.json(
        { error: 'Default bootstrap admin account must remain ADMIN.' },
        { status: 400 }
      );
    }
    if (result.kind === 'bootstrap_approval_locked') {
      return NextResponse.json(
        { error: 'Default bootstrap admin account must remain APPROVED.' },
        { status: 400 }
      );
    }

    return NextResponse.json(result.user, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to update user access.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 400 }
    );
  }
}

export async function listAdminPostcardsLocal(args: {
  request: Request;
  actorId: string;
}): Promise<NextResponse> {
  const parse = safeParseRequestQuery(args.request, (searchParams) =>
    adminPostcardQuerySchema.safeParse({
      q: searchParams.get('q') ?? undefined,
      reportedOnly: searchParams.get('reportedOnly') === '1',
      limit: searchParams.get('limit') ?? undefined
    })
  );
  if (!parse.success) {
    return invalidQueryResponse(parse.error);
  }

  const query = parse.data;
  await recordUserAction({
    request: args.request,
    userId: args.actorId,
    action: query.reportedOnly ? 'ADMIN_POSTCARDS_LIST_REPORTED' : 'ADMIN_POSTCARDS_LIST',
    metadata: {
      reportedOnly: query.reportedOnly,
      search: query.q ?? ''
    }
  });

  const whereAnd: Array<Record<string, unknown>> = query.reportedOnly ? [] : [{ deletedAt: null }];
  if (query.reportedOnly) {
    whereAnd.push({
      reportCases: {
        some: {}
      }
    });
  }
  if (query.q && query.q.length > 0) {
    whereAnd.push(buildPostcardSearchFilter(query.q, { includeUploaderFields: true }));
  }

  const items = await findPostcardsForList({
    where: { AND: whereAnd },
    orderBy: [{ wrongLocationReports: 'desc' }, { createdAt: 'desc' }],
    take: query.limit
  });

  const serialized = serializePostcards(items, { includeOriginalImageUrl: true });
  const activeCaseMap = await findActiveReportCaseDetailMapForPostcards(
    serialized.map((item) => String(item.id))
  );

  const withActiveCase = serialized
    .map((item) => {
      const activeCase = activeCaseMap.get(String(item.id));
      return {
        ...item,
        activeReportCaseId: activeCase?.caseId ?? null,
        activeReportCaseStatus: activeCase?.status ?? null,
        activeReportCaseUpdatedAt: activeCase?.updatedAt.toISOString() ?? null,
        activeReportAdminNote: activeCase?.adminNote ?? null,
        activeReportCount: activeCase?.reportCount ?? 0,
        activeReportReasonCounts: activeCase?.reasonCounts ?? {},
        activeReportReports:
          activeCase?.reports.map((report) => ({
            ...report,
            createdAt: report.createdAt.toISOString()
          })) ?? []
      };
    })
    .filter((item) => {
      if (!query.reportedOnly) {
        return true;
      }
      const reportCount =
        typeof (item as { wrongLocationReports?: unknown }).wrongLocationReports === 'number'
          ? ((item as { wrongLocationReports?: number }).wrongLocationReports ?? 0)
          : 0;
      return item.activeReportCaseId !== null || reportCount > 0;
    });

  return NextResponse.json(withActiveCase, { status: 200 });
}

export async function listAdminFeedbackLocal(args: {
  request: Request;
  actorId: string;
}): Promise<NextResponse> {
  const parse = safeParseRequestQuery(args.request, (searchParams) =>
    adminFeedbackQuerySchema.safeParse({
      q: searchParams.get('q') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      limit: searchParams.get('limit') ?? undefined
    })
  );
  if (!parse.success) {
    return invalidQueryResponse(parse.error);
  }

  const query = parse.data;
  const keyword = normalizeSearchText(query.q);

  await recordUserAction({
    request: args.request,
    userId: args.actorId,
    action: 'ADMIN_FEEDBACK_LIST',
    metadata: {
      status: query.status ?? null,
      search: query.q ?? ''
    }
  });

  const feedbackRows = await scanAll(ddbTables.feedbackMessages);
  const userIds = Array.from(
    new Set(
      feedbackRows
        .map((item) => String(item.userId || '').trim())
        .filter((value) => value.length > 0)
    )
  );
  const users = await batchGetByIds(ddbTables.users, userIds);
  const userById = new Map(
    users.map((item) => [String(item.id || ''), item])
  );

  const rows = feedbackRows
    .filter((item) => {
      const status = String(item.status || FeedbackMessageStatus.OPEN).toUpperCase();
      if (query.status && status !== query.status) {
        return false;
      }
      const user = userById.get(String(item.userId || ''));
      return includesKeyword(
        [
          item.subject,
          item.message,
          user?.email,
          user?.displayName
        ],
        keyword
      );
    })
    .sort((left, right) =>
      String(right.createdAt || '').localeCompare(String(left.createdAt || ''))
    )
    .slice(0, query.limit);

  return NextResponse.json(
    rows.map((item) => {
      const user = userById.get(String(item.userId || ''));
      return {
        id: String(item.id || ''),
        subject: String(item.subject || ''),
        message: String(item.message || ''),
        status: String(item.status || FeedbackMessageStatus.OPEN),
        createdAt: String(item.createdAt || new Date().toISOString()),
        userEmail: String(user?.email || ''),
        userDisplayName:
          typeof user?.displayName === 'string' ? String(user.displayName) : null
      };
    }),
    { status: 200 }
  );
}

export async function listAdminReportCasesLocal(args: {
  request: Request;
  actorId: string;
}): Promise<NextResponse> {
  const parse = safeParseRequestQuery(args.request, (searchParams) =>
    adminReportsQuerySchema.safeParse({
      q: searchParams.get('q') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      limit: searchParams.get('limit') ?? undefined
    })
  );
  if (!parse.success) {
    return invalidQueryResponse(parse.error);
  }

  const query = parse.data;
  await recordUserAction({
    request: args.request,
    userId: args.actorId,
    action: 'ADMIN_POSTCARD_REPORTS_LIST',
    metadata: {
      search: query.q ?? '',
      status: query.status ?? null
    }
  });

  const rows = await listAdminReportCases({
    status: query.status,
    search: query.q,
    limit: query.limit
  });
  const payload = rows.map((row) => serializeAdminReportCaseRecord(row));

  return NextResponse.json(payload, { status: 200 });
}

export async function updateAdminReportStatusByBodyLocal(args: {
  request: Request;
  actorId: string;
}): Promise<NextResponse> {
  return withAdminReportStatusPatch(
    () => args.request.json().then((payload) => adminReportStatusPatchSchema.parse(payload)),
    async (body) =>
      saveAdminReportCaseStatus({
        request: args.request,
        actorId: args.actorId,
        caseId: body.caseId,
        status: body.status,
        adminNote: body.adminNote ?? null
      })
  );
}

export async function getAdminReportCaseDetailLocal(args: {
  request: Request;
  actorId: string;
  caseId: string;
}): Promise<NextResponse> {
  await recordUserAction({
    request: args.request,
    userId: args.actorId,
    action: 'ADMIN_POSTCARD_REPORT_DETAIL',
    metadata: {
      caseId: args.caseId
    }
  });

  const row = await findAdminReportCaseById(args.caseId);
  if (!row) {
    return NextResponse.json({ error: 'Report case not found.' }, { status: 404 });
  }

  return NextResponse.json(serializeAdminReportCaseRecord(row), { status: 200 });
}

export async function updateAdminReportCaseStatusLocal(args: {
  request: Request;
  actorId: string;
  caseId: string;
}): Promise<NextResponse> {
  return withAdminReportStatusPatch(
    () => args.request.json().then((payload) => adminReportCasePatchSchema.parse(payload)),
    async (body) =>
      saveAdminReportCaseStatus({
        request: args.request,
        actorId: args.actorId,
        caseId: args.caseId,
        status: body.status,
        adminNote: body.adminNote ?? null
      })
  );
}
