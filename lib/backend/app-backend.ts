import { isExternalServerlessApiEnabled } from '@/lib/external-api-proxy';
import {
  externalAdminBackend,
  externalDetectionBackend,
  externalFeedbackBackend,
  externalPostcardsBackend,
  externalProfileBackend,
  externalReportsBackend,
  externalUploadBackend
} from '@/lib/backend/external-backends';
import {
  localAdminBackend,
  localDetectionBackend,
  localFeedbackBackend,
  localPostcardsBackend,
  localProfileBackend,
  localReportsBackend,
  localUploadBackend
} from '@/lib/backend/local-backends';
import { type AppBackend } from '@/lib/backend/types';

const localBackend: AppBackend = {
  postcards: localPostcardsBackend,
  reports: localReportsBackend,
  admin: localAdminBackend,
  profile: localProfileBackend,
  feedback: localFeedbackBackend,
  upload: localUploadBackend,
  detection: localDetectionBackend
};

const externalBackend: AppBackend = {
  postcards: externalPostcardsBackend,
  reports: externalReportsBackend,
  admin: externalAdminBackend,
  profile: externalProfileBackend,
  feedback: externalFeedbackBackend,
  upload: externalUploadBackend,
  detection: externalDetectionBackend
};

export function getAppBackend(): AppBackend {
  if (isExternalServerlessApiEnabled()) {
    return externalBackend;
  }
  return localBackend;
}
