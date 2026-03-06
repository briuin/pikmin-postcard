import { PostcardReportStatus, type Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  buildReasonCounts,
  getReporterName,
  type ActiveReportCaseDetail,
  type AdminReportCaseRecord,
  type DashboardReportListItem,
  type ReportCaseStatusUpdateResult
} from '@/lib/postcards/report-types';
import type { CancelDashboardReportResult, ReportRepo } from '@/lib/repos/reports/types';

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
    trackedPostcardIds: [...versionByPostcardId.keys()]
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

async function listDashboardReportsByReporter(userId: string): Promise<DashboardReportListItem[]> {
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

async function cancelDashboardReport(params: {
  userId: string;
  reportId: string;
}): Promise<CancelDashboardReportResult> {
  return prisma.$transaction(async (tx) => {
    const report = await tx.postcardReport.findFirst({
      where: {
        id: params.reportId,
        reporterUserId: params.userId
      },
      include: {
        reportCase: {
          select: {
            id: true,
            status: true
          }
        },
        postcard: {
          select: {
            id: true,
            reportVersion: true,
            wrongLocationReports: true
          }
        }
      }
    });

    if (!report) {
      return { kind: 'not_found' };
    }

    if (
      report.reportCase.status === PostcardReportStatus.VERIFIED ||
      report.reportCase.status === PostcardReportStatus.REMOVED
    ) {
      return { kind: 'resolved' };
    }

    await tx.postcardReport.delete({
      where: {
        id: report.id
      }
    });

    if (
      report.version === report.postcard.reportVersion &&
      report.postcard.wrongLocationReports > 0
    ) {
      await tx.postcard.update({
        where: { id: report.postcard.id },
        data: {
          wrongLocationReports: {
            decrement: 1
          }
        }
      });
    }

    const remainingCount = await tx.postcardReport.count({
      where: {
        caseId: report.caseId
      }
    });

    if (remainingCount === 0) {
      await tx.postcardReportCase.delete({
        where: {
          id: report.caseId
        }
      });
    }

    return {
      kind: 'deleted',
      postcardId: report.postcard.id
    };
  });
}

async function findActiveReportCaseDetailMapForPostcards(
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

async function listAdminReportCases(params: {
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

async function findAdminEditableReportCaseStateByPostcardId(
  postcardId: string
): Promise<PostcardReportStatus | null> {
  return prisma.$transaction(async (tx) => {
    const postcard = await tx.postcard.findUnique({
      where: {
        id: postcardId
      },
      select: {
        id: true,
        reportVersion: true
      }
    });
    if (!postcard) {
      return null;
    }

    const reportCase = await tx.postcardReportCase.findUnique({
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
  });
}

async function updateReportCaseStatus(params: {
  caseId: string;
  nextStatus: PostcardReportStatus;
  adminNote?: string | null;
  resolverUserId: string;
}): Promise<ReportCaseStatusUpdateResult | null> {
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

async function findAdminReportCaseById(caseId: string): Promise<AdminReportCaseRecord | null> {
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

export const prismaReportRepo: ReportRepo = {
  listDashboardReportsByReporter,
  cancelDashboardReport,
  findActiveReportCaseDetailMapForPostcards,
  listAdminReportCases,
  findAdminEditableReportCaseStateByPostcardId,
  updateReportCaseStatus,
  findAdminReportCaseById
};
