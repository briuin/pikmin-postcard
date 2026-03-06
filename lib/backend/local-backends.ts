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
import {
  type AdminBackend,
  type DetectionBackend,
  type FeedbackBackend,
  type PostcardBackend,
  type ProfileBackend,
  type ReportBackend,
  type UploadBackend
} from '@/lib/backend/types';

function toApprovedPostcardActor(actor: {
  id: string;
  role: ApprovedPostcardActor['role'];
}): ApprovedPostcardActor {
  return {
    id: actor.id,
    role: actor.role
  };
}

export const localPostcardsBackend: PostcardBackend = {
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
};

export const localReportsBackend: ReportBackend = {
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
};

export const localAdminBackend: AdminBackend = {
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
};

export const localProfileBackend: ProfileBackend = {
  async get(request) {
    return getProfileLocal({ request });
  },

  async update(request) {
    return updateProfileLocal({ request });
  }
};

export const localFeedbackBackend: FeedbackBackend = {
  async create(request) {
    return withGuardedValue(
      requireApprovedActor({ createIfMissing: true }),
      async (actor) => createFeedbackLocal({ request, actorId: actor.id })
    );
  }
};

export const localUploadBackend: UploadBackend = {
  async create(request) {
    return withGuardedValue(requireApprovedCreator(), async (actor) =>
      uploadImageLocal({ request, actorId: actor.id })
    );
  }
};

export const localDetectionBackend: DetectionBackend = {
  async list(request) {
    const { listDetectionJobsLocal } = await import(
      '@/lib/location-detection/local-detection-route-service'
    );
    return withGuardedValue(
      requireAuthenticatedUserId({ createIfMissing: true }),
      async (userId) => listDetectionJobsLocal({ request, userId })
    );
  },

  async create(request) {
    const { submitDetectionJobLocal } = await import(
      '@/lib/location-detection/local-detection-route-service'
    );
    return withGuardedValue(requireApprovedDetectionSubmitter(), async (actor) =>
      submitDetectionJobLocal({ request, actorId: actor.id })
    );
  }
};
