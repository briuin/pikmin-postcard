import { PostcardReportStatus, type Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type ActiveReportCaseSummary = {
  postcardId: string;
  caseId: string;
  status: PostcardReportStatus;
  updatedAt: Date;
};

export type ActiveReportCaseDetail = ActiveReportCaseSummary & {
  adminNote: string | null;
  reportCount: number;
  reasonCounts: Record<string, number>;
  reports: Array<{
    id: string;
    reason: string;
    description: string | null;
    reporterName: string;
    createdAt: Date;
  }>;
};

export type DashboardReportListItem = {
  reportId: string;
  caseId: string;
  postcardId: string;
  postcardTitle: string;
  postcardImageUrl: string | null;
  postcardPlaceName: string | null;
  postcardDeletedAt: Date | null;
  reportReason: string;
  reportDescription: string | null;
  reportVersion: number;
  status: PostcardReportStatus;
  adminNote: string | null;
  reportedAt: Date;
  statusUpdatedAt: Date;
};

type PostcardVersionRow = {
  id: string;
  reportVersion: number;
};

type ReporterProfileRow = {
  email: string;
  displayName: string | null;
};

type ReportItemRow = {
  id: string;
  reason: string;
  description: string | null;
  createdAt: Date;
  reporter: ReporterProfileRow;
};

type ReportCasePostcardBase = {
  id: string;
  title: string;
  imageUrl: string | null;
  placeName: string | null;
  deletedAt: Date | null;
  wrongLocationReports: number;
  reportVersion: number;
};

type AdminReportCaseRow = {
  id: string;
  postcardId: string;
  version: number;
  status: PostcardReportStatus;
  adminNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  postcard: ReportCasePostcardBase & {
    user: ReporterProfileRow;
  };
  reports: ReportItemRow[];
};

export type AdminReportCaseRecord = {
  caseId: string;
  postcardId: string;
  version: number;
  status: PostcardReportStatus;
  adminNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  postcard: ReportCasePostcardBase & {
    uploaderName: string;
  };
  reportCount: number;
  reasonCounts: Record<string, number>;
  reports: Array<{
    id: string;
    reason: string;
    description: string | null;
    createdAt: Date;
    reporterName: string;
  }>;
};

export type SerializedAdminReportCaseRecord = Omit<
  AdminReportCaseRecord,
  'createdAt' | 'updatedAt' | 'resolvedAt' | 'postcard' | 'reports'
> & {
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  postcard: Omit<AdminReportCaseRecord['postcard'], 'deletedAt'> & {
    deletedAt: string | null;
  };
  reports: Array<Omit<AdminReportCaseRecord['reports'][number], 'createdAt'> & { createdAt: string }>;
};

export type ReportCaseStatusUpdateResult = {
  caseId: string;
  postcardId: string;
  status: PostcardReportStatus;
  reportVersion: number;
  wrongLocationReports: number;
  postcardDeletedAt: Date | null;
};

function getReporterName(reporter: ReporterProfileRow): string {
  return reporter.displayName || reporter.email;
}

function buildReasonCounts(reports: Array<{ reason: string }>): Record<string, number> {
  return reports.reduce<Record<string, number>>((acc, report) => {
    acc[report.reason] = (acc[report.reason] ?? 0) + 1;
    return acc;
  }, {});
}

function toAdminReportCaseRecord(row: AdminReportCaseRow): AdminReportCaseRecord {
  return {
    caseId: row.id,
    postcardId: row.postcardId,
    version: row.version,
    status: row.status,
    adminNote: row.adminNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    resolvedAt: row.resolvedAt,
    postcard: {
      id: row.postcard.id,
      title: row.postcard.title,
      imageUrl: row.postcard.imageUrl,
      placeName: row.postcard.placeName,
      deletedAt: row.postcard.deletedAt,
      wrongLocationReports: row.postcard.wrongLocationReports,
      reportVersion: row.postcard.reportVersion,
      uploaderName: getReporterName(row.postcard.user)
    },
    reportCount: row.reports.length,
    reasonCounts: buildReasonCounts(row.reports),
    reports: row.reports.map((report) => ({
      id: report.id,
      reason: report.reason,
      description: report.description,
      createdAt: report.createdAt,
      reporterName: getReporterName(report.reporter)
    }))
  };
}

export function serializeAdminReportCaseRecord(
  record: AdminReportCaseRecord
): SerializedAdminReportCaseRecord {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    postcard: {
      ...record.postcard,
      deletedAt: record.postcard.deletedAt?.toISOString() ?? null
    },
    reports: record.reports.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString()
    }))
  };
}

export function serializeReportCaseStatusUpdate(result: ReportCaseStatusUpdateResult) {
  return {
    caseId: result.caseId,
    postcardId: result.postcardId,
    status: result.status,
    reportVersion: result.reportVersion,
    wrongLocationReports: result.wrongLocationReports,
    postcardDeletedAt: result.postcardDeletedAt?.toISOString() ?? null
  };
}

function buildReportInclude(reportTake?: number): Prisma.PostcardReportCaseInclude {
  return {
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
      ...(typeof reportTake === 'number' ? { take: reportTake } : {}),
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
  };
}

async function findPostcardVersionMap(postcardIds: string[]): Promise<Map<string, number>> {
  if (postcardIds.length === 0) {
    return new Map();
  }

  const postcards: PostcardVersionRow[] = await prisma.postcard.findMany({
    where: {
      id: {
        in: postcardIds
      }
    },
    select: {
      id: true,
      reportVersion: true
    }
  });

  return new Map(postcards.map((postcard) => [postcard.id, postcard.reportVersion]));
}

function getTrackedPostcardIds(versionByPostcardId: Map<string, number>): string[] {
  return [...versionByPostcardId.keys()];
}

type ActiveCaseScope = {
  versionByPostcardId: Map<string, number>;
  trackedPostcardIds: string[];
};

async function resolveActiveCaseScope(postcardIds: string[]): Promise<ActiveCaseScope | null> {
  const versionByPostcardId = await findPostcardVersionMap(postcardIds);
  if (versionByPostcardId.size === 0) {
    return null;
  }

  return {
    versionByPostcardId,
    trackedPostcardIds: getTrackedPostcardIds(versionByPostcardId)
  };
}

function forEachCurrentVersionCase<T extends { postcardId: string; version: number }>(
  cases: T[],
  versionByPostcardId: Map<string, number>,
  run: (item: T) => void
) {
  for (const item of cases) {
    if (versionByPostcardId.get(item.postcardId) !== item.version) {
      continue;
    }
    run(item);
  }
}

export async function listDashboardReportsByReporter(userId: string): Promise<DashboardReportListItem[]> {
  const rows = await prisma.postcardReport.findMany({
    where: {
      reporterUserId: userId
    },
    orderBy: [{ createdAt: 'desc' }],
    take: 300,
    include: {
      reportCase: {
        select: {
          id: true,
          status: true,
          adminNote: true,
          updatedAt: true
        }
      },
      postcard: {
        select: {
          id: true,
          title: true,
          imageUrl: true,
          placeName: true,
          deletedAt: true
        }
      }
    }
  });

  return rows.map((row) => ({
    reportId: row.id,
    caseId: row.reportCase.id,
    postcardId: row.postcard.id,
    postcardTitle: row.postcard.title,
    postcardImageUrl: row.postcard.imageUrl,
    postcardPlaceName: row.postcard.placeName,
    postcardDeletedAt: row.postcard.deletedAt,
    reportReason: row.reason,
    reportDescription: row.description,
    reportVersion: row.version,
    status: row.reportCase.status,
    adminNote: row.reportCase.adminNote,
    reportedAt: row.createdAt,
    statusUpdatedAt: row.reportCase.updatedAt
  }));
}

export async function findActiveReportCaseDetailMapForPostcards(
  postcardIds: string[]
): Promise<Map<string, ActiveReportCaseDetail>> {
  const activeCaseScope = await resolveActiveCaseScope(postcardIds);
  if (!activeCaseScope) {
    return new Map();
  }
  const { versionByPostcardId, trackedPostcardIds } = activeCaseScope;
  const cases = await prisma.postcardReportCase.findMany({
    where: {
      postcardId: {
        in: trackedPostcardIds
      }
    },
    include: {
      reports: {
        orderBy: [{ createdAt: 'desc' }],
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

  const detailByPostcardId = new Map<string, ActiveReportCaseDetail>();
  forEachCurrentVersionCase(cases, versionByPostcardId, (item) => {
    detailByPostcardId.set(item.postcardId, {
      postcardId: item.postcardId,
      caseId: item.id,
      status: item.status,
      updatedAt: item.updatedAt,
      adminNote: item.adminNote,
      reportCount: item.reports.length,
      reasonCounts: buildReasonCounts(item.reports),
      reports: item.reports.map((report) => ({
        id: report.id,
        reason: report.reason,
        description: report.description,
        reporterName: getReporterName(report.reporter),
        createdAt: report.createdAt
      }))
    });
  });

  return detailByPostcardId;
}

export async function listAdminReportCases(params: {
  status?: PostcardReportStatus;
  search?: string;
  limit: number;
  reportTake?: number;
}): Promise<AdminReportCaseRecord[]> {
  const where: Prisma.PostcardReportCaseWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.search
      ? {
          OR: [
            { postcard: { title: { contains: params.search, mode: 'insensitive' } } },
            { postcard: { placeName: { contains: params.search, mode: 'insensitive' } } },
            {
              reports: {
                some: {
                  description: { contains: params.search, mode: 'insensitive' }
                }
              }
            },
            {
              reports: {
                some: {
                  reporter: {
                    email: { contains: params.search, mode: 'insensitive' }
                  }
                }
              }
            },
            {
              reports: {
                some: {
                  reporter: {
                    displayName: { contains: params.search, mode: 'insensitive' }
                  }
                }
              }
            }
          ]
        }
      : {})
  };

  const rows = (await prisma.postcardReportCase.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }],
    take: params.limit,
    include: buildReportInclude(params.reportTake ?? 30)
  })) as unknown as AdminReportCaseRow[];

  return rows.map((row) => toAdminReportCaseRecord(row));
}

export async function findAdminEditableReportCaseState(params: {
  tx: Prisma.TransactionClient;
  postcardId: string;
}): Promise<PostcardReportStatus | null> {
  const postcard = await params.tx.postcard.findUnique({
    where: {
      id: params.postcardId
    },
    select: {
      id: true,
      reportVersion: true
    }
  });
  if (!postcard) {
    return null;
  }

  const reportCase = await params.tx.postcardReportCase.findUnique({
    where: {
      postcardId_version: {
        postcardId: postcard.id,
        version: postcard.reportVersion
      }
    },
    select: {
      status: true
    }
  });

  return reportCase?.status ?? null;
}

export async function findAdminEditableReportCaseStateByPostcardId(
  postcardId: string
): Promise<PostcardReportStatus | null> {
  return prisma.$transaction((tx) =>
    findAdminEditableReportCaseState({
      tx,
      postcardId
    })
  );
}

type UpdateReportCaseStatusParams = {
  caseId: string;
  nextStatus: PostcardReportStatus;
  adminNote?: string | null;
  resolverUserId: string;
};

export async function updateReportCaseStatus(
  params: UpdateReportCaseStatusParams
): Promise<ReportCaseStatusUpdateResult | null> {
  return prisma.$transaction(async (tx) => {
    const reportCase = await tx.postcardReportCase.findUnique({
      where: {
        id: params.caseId
      },
      include: {
        postcard: {
          select: {
            id: true,
            reportVersion: true,
            deletedAt: true
          }
        }
      }
    });

    if (!reportCase) {
      return null;
    }

    const now = new Date();
    const shouldResolve =
      params.nextStatus === PostcardReportStatus.VERIFIED ||
      params.nextStatus === PostcardReportStatus.REMOVED;

    const normalizedAdminNote =
      typeof params.adminNote === 'string' ? params.adminNote.trim() || null : null;

    const updatedCase = await tx.postcardReportCase.update({
      where: {
        id: params.caseId
      },
      data: {
        status: params.nextStatus,
        adminNote: normalizedAdminNote,
        resolvedAt: shouldResolve ? now : null,
        resolvedByUserId: shouldResolve ? params.resolverUserId : null
      },
      select: {
        id: true,
        status: true
      }
    });

    let updatedPostcard = await tx.postcard.findUnique({
      where: {
        id: reportCase.postcard.id
      },
      select: {
        id: true,
        reportVersion: true,
        wrongLocationReports: true,
        deletedAt: true
      }
    });

    if (!updatedPostcard) {
      return null;
    }

    if (
      params.nextStatus === PostcardReportStatus.VERIFIED &&
      updatedPostcard.reportVersion === reportCase.version
    ) {
      updatedPostcard = await tx.postcard.update({
        where: {
          id: updatedPostcard.id
        },
        data: {
          wrongLocationReports: 0,
          reportVersion: {
            increment: 1
          }
        },
        select: {
          id: true,
          reportVersion: true,
          wrongLocationReports: true,
          deletedAt: true
        }
      });
    } else if (params.nextStatus === PostcardReportStatus.REMOVED) {
      updatedPostcard = await tx.postcard.update({
        where: {
          id: updatedPostcard.id
        },
        data: {
          wrongLocationReports: 0,
          deletedAt: updatedPostcard.deletedAt ?? now
        },
        select: {
          id: true,
          reportVersion: true,
          wrongLocationReports: true,
          deletedAt: true
        }
      });
    }

    return {
      caseId: updatedCase.id,
      postcardId: updatedPostcard.id,
      status: updatedCase.status,
      reportVersion: updatedPostcard.reportVersion,
      wrongLocationReports: updatedPostcard.wrongLocationReports,
      postcardDeletedAt: updatedPostcard.deletedAt
    };
  });
}

export async function findAdminReportCaseById(caseId: string): Promise<AdminReportCaseRecord | null> {
  const row = (await prisma.postcardReportCase.findUnique({
    where: {
      id: caseId
    },
    include: buildReportInclude()
  })) as AdminReportCaseRow | null;

  if (!row) {
    return null;
  }

  return toAdminReportCaseRecord(row);
}
