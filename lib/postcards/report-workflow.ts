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

export async function findActiveReportCaseMapForPostcards(
  postcardIds: string[]
): Promise<Map<string, ActiveReportCaseSummary>> {
  if (postcardIds.length === 0) {
    return new Map();
  }

  const postcards = await prisma.postcard.findMany({
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

  if (postcards.length === 0) {
    return new Map();
  }

  const versionByPostcardId = new Map(postcards.map((postcard) => [postcard.id, postcard.reportVersion]));
  const cases = await prisma.postcardReportCase.findMany({
    where: {
      postcardId: {
        in: postcards.map((postcard) => postcard.id)
      }
    },
    select: {
      id: true,
      postcardId: true,
      version: true,
      status: true,
      updatedAt: true
    }
  });

  const summaryByPostcardId = new Map<string, ActiveReportCaseSummary>();
  for (const item of cases) {
    if (versionByPostcardId.get(item.postcardId) !== item.version) {
      continue;
    }
    summaryByPostcardId.set(item.postcardId, {
      postcardId: item.postcardId,
      caseId: item.id,
      status: item.status,
      updatedAt: item.updatedAt
    });
  }

  return summaryByPostcardId;
}

export async function findActiveReportCaseDetailMapForPostcards(
  postcardIds: string[]
): Promise<Map<string, ActiveReportCaseDetail>> {
  if (postcardIds.length === 0) {
    return new Map();
  }

  const postcards = await prisma.postcard.findMany({
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
  if (postcards.length === 0) {
    return new Map();
  }

  const versionByPostcardId = new Map(postcards.map((postcard) => [postcard.id, postcard.reportVersion]));
  const cases = await prisma.postcardReportCase.findMany({
    where: {
      postcardId: {
        in: postcards.map((postcard) => postcard.id)
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
  for (const item of cases) {
    if (versionByPostcardId.get(item.postcardId) !== item.version) {
      continue;
    }

    const reasonCounts = item.reports.reduce<Record<string, number>>((acc, report) => {
      acc[report.reason] = (acc[report.reason] ?? 0) + 1;
      return acc;
    }, {});

    detailByPostcardId.set(item.postcardId, {
      postcardId: item.postcardId,
      caseId: item.id,
      status: item.status,
      updatedAt: item.updatedAt,
      adminNote: item.adminNote,
      reportCount: item.reports.length,
      reasonCounts,
      reports: item.reports.map((report) => ({
        id: report.id,
        reason: report.reason,
        description: report.description,
        reporterName: report.reporter.displayName || report.reporter.email,
        createdAt: report.createdAt
      }))
    });
  }

  return detailByPostcardId;
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
): Promise<{
  caseId: string;
  postcardId: string;
  status: PostcardReportStatus;
  reportVersion: number;
  wrongLocationReports: number;
  postcardDeletedAt: Date | null;
} | null> {
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

export async function findAdminReportCaseById(caseId: string) {
  const row = await prisma.postcardReportCase.findUnique({
    where: {
      id: caseId
    },
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

  if (!row) {
    return null;
  }

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
      uploaderName: row.postcard.user.displayName || row.postcard.user.email
    },
    reportCount: row.reports.length,
    reasonCounts,
    reports: row.reports.map((report) => ({
      id: report.id,
      reason: report.reason,
      description: report.description,
      createdAt: report.createdAt,
      reporterName: report.reporter.displayName || report.reporter.email
    }))
  };
}
