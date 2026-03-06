import {
  type AdminBackend,
  type DetectionBackend,
  type FeedbackBackend,
  type PostcardBackend,
  type ProfileBackend,
  type ReportBackend,
  type UploadBackend
} from '@/lib/backend/types';
import { proxyOrServerError } from '@/lib/backend/proxy-or-error';

export const externalPostcardsBackend: PostcardBackend = {
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
};

export const externalReportsBackend: ReportBackend = {
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
};

export const externalAdminBackend: AdminBackend = {
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
};

export const externalProfileBackend: ProfileBackend = {
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
};

export const externalFeedbackBackend: FeedbackBackend = {
  async create(request) {
    return proxyOrServerError({
      request,
      path: '/feedback'
    });
  }
};

export const externalUploadBackend: UploadBackend = {
  async create(request) {
    return proxyOrServerError({
      request,
      path: '/upload-image'
    });
  }
};

export const externalDetectionBackend: DetectionBackend = {
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
};
