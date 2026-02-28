import { PostcardReportStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireManagerActor, withGuardedValue } from '@/lib/api-guards';
import {
  requireManagerAndParseQuery,
  safeParseRequestQuery
} from '@/lib/admin/route-helpers';
import { prisma } from '@/lib/prisma';
import { updateReportCaseStatus } from '@/lib/postcards/report-workflow';
import { recordUserAction } from '@/lib/user-action-log';

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

export async function GET(request: Request) {
  const context = await requireManagerAndParseQuery(request, () =>
    safeParseRequestQuery(request, (searchParams) =>
      adminReportsQuerySchema.safeParse({
        q: searchParams.get('q') ?? undefined,
        status: searchParams.get('status') ?? undefined,
        limit: searchParams.get('limit') ?? undefined
      })
    )
  );

  if (!context.ok) {
    return context.response;
  }

  const { actor, query } = context;
  await recordUserAction({
    request,
    userId: actor.id,
    action: 'ADMIN_POSTCARD_REPORTS_LIST',
    metadata: {
      search: query.q ?? '',
      status: query.status ?? null
    }
  });

  const where = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.q
      ? {
          OR: [
            { postcard: { title: { contains: query.q, mode: 'insensitive' as const } } },
            { postcard: { placeName: { contains: query.q, mode: 'insensitive' as const } } },
            {
              reports: {
                some: {
                  description: { contains: query.q, mode: 'insensitive' as const }
                }
              }
            },
            {
              reports: {
                some: {
                  reporter: {
                    email: { contains: query.q, mode: 'insensitive' as const }
                  }
                }
              }
            },
            {
              reports: {
                some: {
                  reporter: {
                    displayName: { contains: query.q, mode: 'insensitive' as const }
                  }
                }
              }
            }
          ]
        }
      : {})
  };

  const rows = await prisma.postcardReportCase.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }],
    take: query.limit,
    include: {
      postcard: {
        select: {
          id: true,
          title: true,
          imageUrl: true,
          placeName: true,
          deletedAt: true,
          wrongLocationReports: true,
          reportVersion: true,
          user: {
            select: {
              email: true,
              displayName: true
            }
          }
        }
      },
      reports: {
        orderBy: [{ createdAt: 'desc' }],
        take: 30,
        select: {
          id: true,
          reason: true,
          description: true,
          createdAt: true,
          reporter: {
            select: {
              email: true,
              displayName: true
            }
          }
        }
      }
    }
  });

  const payload = rows.map((row) => {
    const reasonCounts = row.reports.reduce<Record<string, number>>((acc, report) => {
      acc[report.reason] = (acc[report.reason] ?? 0) + 1;
      return acc;
    }, {});

    return {
      caseId: row.id,
      postcardId: row.postcardId,
      version: row.version,
      status: row.status,
      adminNote: row.adminNote,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      postcard: {
        id: row.postcard.id,
        title: row.postcard.title,
        imageUrl: row.postcard.imageUrl,
        placeName: row.postcard.placeName,
        deletedAt: row.postcard.deletedAt?.toISOString() ?? null,
        wrongLocationReports: row.postcard.wrongLocationReports,
        reportVersion: row.postcard.reportVersion,
        uploaderName: row.postcard.user.displayName || row.postcard.user.email
      },
      reportCount: row.reports.length,
      reasonCounts,
      reports: row.reports.map((report) => ({
        id: report.id,
        reason: report.reason,
        description: report.description,
        createdAt: report.createdAt.toISOString(),
        reporterName: report.reporter.displayName || report.reporter.email
      }))
    };
  });

  return NextResponse.json(payload, { status: 200 });
}

export async function PATCH(request: Request) {
  return withGuardedValue(requireManagerActor(), async (actor) => {
    try {
      const body = adminReportStatusPatchSchema.parse(await request.json());

      await recordUserAction({
        request,
        userId: actor.id,
        action: 'ADMIN_POSTCARD_REPORT_STATUS_UPDATE',
        metadata: {
          caseId: body.caseId,
          status: body.status
        }
      });

      const updated = await updateReportCaseStatus({
        caseId: body.caseId,
        nextStatus: body.status,
        adminNote: body.adminNote ?? null,
        resolverUserId: actor.id
      });

      if (!updated) {
        return NextResponse.json({ error: 'Report case not found.' }, { status: 404 });
      }

      return NextResponse.json(
        {
          caseId: updated.caseId,
          postcardId: updated.postcardId,
          status: updated.status,
          reportVersion: updated.reportVersion,
          wrongLocationReports: updated.wrongLocationReports,
          postcardDeletedAt: updated.postcardDeletedAt?.toISOString() ?? null
        },
        { status: 200 }
      );
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Failed to update report status.',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 400 }
      );
    }
  });
}
