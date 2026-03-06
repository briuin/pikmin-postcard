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

export const localAppBackend: AppBackend = {
  postcards: localPostcardsBackend,
  reports: localReportsBackend,
  admin: localAdminBackend,
  profile: localProfileBackend,
  feedback: localFeedbackBackend,
  upload: localUploadBackend,
  detection: localDetectionBackend
};

export function getAppBackend(): AppBackend {
  return localAppBackend;
}
