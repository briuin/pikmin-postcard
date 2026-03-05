import { NextResponse } from 'next/server';
import { getAuthenticatedUserId } from '@/lib/api-auth';
import {
  requireAdminActor,
  requireApprovedActor,
  requireApprovedCreator,
  requireApprovedDetectionSubmitter,
  requireApprovedVoter,
  requireAuthenticatedUserId,
  requireManagerActor,
  withGuardedValue
} from '@/lib/api-guards';
import {
  isExternalServerlessApiEnabled,
  proxyExternalApiRequest
} from '@/lib/external-api-proxy';
import {
  getAdminReportCaseDetailLocal,
  listAdminFeedbackLocal,
  listAdminPostcardsLocal,
  listAdminReportCasesLocal,
  listAdminUsersLocal,
  updateAdminReportCaseStatusLocal,
  updateAdminReportStatusByBodyLocal,
  updateAdminUserAccessLocal
} from '@/lib/admin/local-admin-route-service';
import { createFeedbackLocal } from '@/lib/feedback/local-feedback-route-service';
import {
  listDetectionJobsLocal,
  submitDetectionJobLocal
} from '@/lib/location-detection/local-detection-route-service';
import {
  type ApprovedPostcardActor,
  createPostcardLocal,
  getPostcardByIdLocal,
  listMinePostcardsLocal,
  listPublicPostcardsLocal,
  listSavedPostcardsLocal,
  softDeletePostcardLocal,
  submitPostcardFeedbackLocal,
  updatePostcardLocal
} from '@/lib/postcards/local-postcard-route-service';
import {
  cancelDashboardReportLocal,
  listDashboardReportsLocal
} from '@/lib/postcards/local-report-route-service';
import { getProfileLocal, updateProfileLocal } from '@/lib/profile/local-profile-route-service';
import { uploadImageLocal } from '@/lib/uploads/local-upload-image-route-service';

type PostcardBackend = {
  list(request: Request): Promise<Response>;
  create(request: Request): Promise<Response>;
  getById(request: Request, postcardId: string): Promise<Response>;
  updateById(request: Request, postcardId: string): Promise<Response>;
  deleteById(request: Request, postcardId: string): Promise<Response>;
  submitFeedbackById(request: Request, postcardId: string): Promise<Response>;
};

type ReportBackend = {
  list(request: Request): Promise<Response>;
  cancelById(request: Request, reportId: string): Promise<Response>;
};

type AdminBackend = {
  listUsers(request: Request): Promise<Response>;
  updateUser(request: Request): Promise<Response>;
  listPostcards(request: Request): Promise<Response>;
  listFeedback(request: Request): Promise<Response>;
  listReports(request: Request): Promise<Response>;
  updateReport(request: Request): Promise<Response>;
  getReportCase(request: Request, caseId: string): Promise<Response>;
  updateReportCase(request: Request, caseId: string): Promise<Response>;
};

type ProfileBackend = {
  get(request: Request): Promise<Response>;
  update(request: Request): Promise<Response>;
};

type FeedbackBackend = {
  create(request: Request): Promise<Response>;
};

type UploadBackend = {
  create(request: Request): Promise<Response>;
};

type DetectionBackend = {
  list(request: Request): Promise<Response>;
  create(request: Request): Promise<Response>;
};

export type AppBackend = {
  postcards: PostcardBackend;
  reports: ReportBackend;
  admin: AdminBackend;
  profile: ProfileBackend;
  feedback: FeedbackBackend;
  upload: UploadBackend;
  detection: DetectionBackend;
};

async function proxyOrServerError(args: {
  request: Request;
  path: string;
  method?: string;
}): Promise<Response> {
  const proxied = await proxyExternalApiRequest(args);
  if (proxied) {
    return proxied;
  }

  return NextResponse.json(
    { error: 'External serverless backend is not configured.' },
    { status: 500 }
  );
}

function toApprovedPostcardActor(actor: {
  id: string;
  role: ApprovedPostcardActor['role'];
}): ApprovedPostcardActor {
  return {
    id: actor.id,
    role: actor.role
  };
}

const localBackend: AppBackend = {
  postcards: {
    async list(request) {
      const url = new URL(request.url);
      const mineOnly = url.searchParams.get('mine') === '1';
      const savedOnly = url.searchParams.get('saved') === '1';
      const viewerUserId = await getAuthenticatedUserId();

      if (mineOnly) {
        return withGuardedValue(
          requireAuthenticatedUserId({ createIfMissing: true }),
          async (userId) => listMinePostcardsLocal({ request, userId, viewerUserId })
        );
      }

      if (savedOnly) {
        return withGuardedValue(
          requireAuthenticatedUserId({ createIfMissing: true }),
          async (userId) => listSavedPostcardsLocal({ request, userId, viewerUserId })
        );
      }

      return listPublicPostcardsLocal({ url, viewerUserId });
    },

    async create(request) {
      return withGuardedValue(requireApprovedCreator(), async (actor) =>
        createPostcardLocal({ request, actorId: actor.id })
      );
    },

    async getById(_request, postcardId) {
      return getPostcardByIdLocal(postcardId);
    },

    async updateById(request, postcardId) {
      return withGuardedValue(requireApprovedActor(), async (actor) =>
        updatePostcardLocal({
          request,
          postcardId,
          actor: toApprovedPostcardActor(actor)
        })
      );
    },

    async deleteById(request, postcardId) {
      return withGuardedValue(requireApprovedActor(), async (actor) =>
        softDeletePostcardLocal({
          request,
          postcardId,
          actorId: actor.id
        })
      );
    },

    async submitFeedbackById(request, postcardId) {
      return withGuardedValue(requireApprovedVoter(), async (actor) =>
        submitPostcardFeedbackLocal({
          request,
          postcardId,
          actorId: actor.id
        })
      );
    }
  },

  reports: {
    async list(request) {
      return withGuardedValue(
        requireAuthenticatedUserId({ createIfMissing: true }),
        async (userId) => listDashboardReportsLocal({ request, userId })
      );
    },

    async cancelById(request, reportId) {
      return withGuardedValue(
        requireAuthenticatedUserId({ createIfMissing: true }),
        async (userId) => cancelDashboardReportLocal({ request, userId, reportId })
      );
    }
  },

  admin: {
    async listUsers(request) {
      return withGuardedValue(requireAdminActor(), async (actor) =>
        listAdminUsersLocal({ request, actorId: actor.id })
      );
    },

    async updateUser(request) {
      return withGuardedValue(requireAdminActor(), async (actor) =>
        updateAdminUserAccessLocal({ request, actorId: actor.id })
      );
    },

    async listPostcards(request) {
      return withGuardedValue(requireManagerActor(), async (actor) =>
        listAdminPostcardsLocal({ request, actorId: actor.id })
      );
    },

    async listFeedback(request) {
      return withGuardedValue(requireManagerActor(), async (actor) =>
        listAdminFeedbackLocal({ request, actorId: actor.id })
      );
    },

    async listReports(request) {
      return withGuardedValue(requireManagerActor(), async (actor) =>
        listAdminReportCasesLocal({ request, actorId: actor.id })
      );
    },

    async updateReport(request) {
      return withGuardedValue(requireManagerActor(), async (actor) =>
        updateAdminReportStatusByBodyLocal({ request, actorId: actor.id })
      );
    },

    async getReportCase(request, caseId) {
      return withGuardedValue(requireManagerActor(), async (actor) =>
        getAdminReportCaseDetailLocal({ request, actorId: actor.id, caseId })
      );
    },

    async updateReportCase(request, caseId) {
      return withGuardedValue(requireManagerActor(), async (actor) =>
        updateAdminReportCaseStatusLocal({ request, actorId: actor.id, caseId })
      );
    }
  },

  profile: {
    async get(request) {
      return getProfileLocal({ request });
    },
    async update(request) {
      return updateProfileLocal({ request });
    }
  },

  feedback: {
    async create(request) {
      return withGuardedValue(
        requireApprovedActor({ createIfMissing: true }),
        async (actor) => createFeedbackLocal({ request, actorId: actor.id })
      );
    }
  },

  upload: {
    async create(request) {
      return withGuardedValue(requireApprovedCreator(), async (actor) =>
        uploadImageLocal({ request, actorId: actor.id })
      );
    }
  },

  detection: {
    async list(request) {
      return withGuardedValue(
        requireAuthenticatedUserId({ createIfMissing: true }),
        async (userId) => listDetectionJobsLocal({ request, userId })
      );
    },

    async create(request) {
      return withGuardedValue(requireApprovedDetectionSubmitter(), async (actor) =>
        submitDetectionJobLocal({ request, actorId: actor.id })
      );
    }
  }
};

const externalBackend: AppBackend = {
  postcards: {
    async list(request) {
      const url = new URL(request.url);
      return proxyOrServerError({
        request,
        path: `/postcards${url.search}`
      });
    },

    async create(request) {
      return proxyOrServerError({
        request,
        path: '/postcards'
      });
    },

    async getById(request, postcardId) {
      return proxyOrServerError({
        request,
        path: `/postcards/${encodeURIComponent(postcardId)}`
      });
    },

    async updateById(request, postcardId) {
      return proxyOrServerError({
        request,
        path: `/postcards/${encodeURIComponent(postcardId)}`
      });
    },

    async deleteById(request, postcardId) {
      return proxyOrServerError({
        request,
        path: `/postcards/${encodeURIComponent(postcardId)}`
      });
    },

    async submitFeedbackById(request, postcardId) {
      return proxyOrServerError({
        request,
        path: `/postcards/${encodeURIComponent(postcardId)}/feedback`
      });
    }
  },

  reports: {
    async list(request) {
      return proxyOrServerError({
        request,
        path: '/reports'
      });
    },

    async cancelById(request, reportId) {
      return proxyOrServerError({
        request,
        path: `/reports/${encodeURIComponent(reportId)}`
      });
    }
  },

  admin: {
    async listUsers(request) {
      const url = new URL(request.url);
      return proxyOrServerError({
        request,
        path: `/admin/users${url.search}`
      });
    },

    async updateUser(request) {
      return proxyOrServerError({
        request,
        path: '/admin/users'
      });
    },

    async listPostcards(request) {
      const url = new URL(request.url);
      return proxyOrServerError({
        request,
        path: `/admin/postcards${url.search}`
      });
    },

    async listFeedback(request) {
      const url = new URL(request.url);
      return proxyOrServerError({
        request,
        path: `/admin/feedback${url.search}`
      });
    },

    async listReports(request) {
      const url = new URL(request.url);
      return proxyOrServerError({
        request,
        path: `/admin/reports${url.search}`
      });
    },

    async updateReport(request) {
      return proxyOrServerError({
        request,
        path: '/admin/reports'
      });
    },

    async getReportCase(request, caseId) {
      return proxyOrServerError({
        request,
        path: `/admin/reports/${encodeURIComponent(caseId)}`
      });
    },

    async updateReportCase(request, caseId) {
      return proxyOrServerError({
        request,
        path: `/admin/reports/${encodeURIComponent(caseId)}`
      });
    }
  },

  profile: {
    async get(request) {
      return proxyOrServerError({
        request,
        path: '/profile'
      });
    },
    async update(request) {
      return proxyOrServerError({
        request,
        path: '/profile'
      });
    }
  },

  feedback: {
    async create(request) {
      return proxyOrServerError({
        request,
        path: '/feedback'
      });
    }
  },

  upload: {
    async create(request) {
      return proxyOrServerError({
        request,
        path: '/upload-image'
      });
    }
  },

  detection: {
    async list(request) {
      return proxyOrServerError({
        request,
        path: '/location-from-image'
      });
    },
    async create(request) {
      return proxyOrServerError({
        request,
        path: '/location-from-image'
      });
    }
  }
};

export function getAppBackend(): AppBackend {
  if (isExternalServerlessApiEnabled()) {
    return externalBackend;
  }
  return localBackend;
}
