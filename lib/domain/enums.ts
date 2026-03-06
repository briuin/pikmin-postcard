export const LocationStatus = {
  AUTO: 'AUTO',
  USER_CONFIRMED: 'USER_CONFIRMED',
  MANUAL: 'MANUAL'
} as const;
export type LocationStatus = (typeof LocationStatus)[keyof typeof LocationStatus];

export const DetectionJobStatus = {
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED'
} as const;
export type DetectionJobStatus = (typeof DetectionJobStatus)[keyof typeof DetectionJobStatus];

export const FeedbackAction = {
  LIKE: 'LIKE',
  DISLIKE: 'DISLIKE',
  REPORT_WRONG_LOCATION: 'REPORT_WRONG_LOCATION',
  FAVORITE: 'FAVORITE',
  COLLECTED: 'COLLECTED'
} as const;
export type FeedbackAction = (typeof FeedbackAction)[keyof typeof FeedbackAction];

export const PostcardEditAction = {
  DETAILS_UPDATED: 'DETAILS_UPDATED',
  CROP_UPDATED: 'CROP_UPDATED',
  SOFT_DELETED: 'SOFT_DELETED'
} as const;
export type PostcardEditAction = (typeof PostcardEditAction)[keyof typeof PostcardEditAction];

export const UserRole = {
  MEMBER: 'MEMBER',
  MANAGER: 'MANAGER',
  ADMIN: 'ADMIN'
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED'
} as const;
export type UserApprovalStatus = (typeof UserApprovalStatus)[keyof typeof UserApprovalStatus];

export const PostcardType = {
  MUSHROOM: 'MUSHROOM',
  FLOWER: 'FLOWER',
  EXPLORATION: 'EXPLORATION',
  UNKNOWN: 'UNKNOWN'
} as const;
export type PostcardType = (typeof PostcardType)[keyof typeof PostcardType];

export const FeedbackMessageStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED'
} as const;
export type FeedbackMessageStatus = (typeof FeedbackMessageStatus)[keyof typeof FeedbackMessageStatus];

export const PostcardReportReason = {
  WRONG_LOCATION: 'WRONG_LOCATION',
  SPAM: 'SPAM',
  ILLEGAL_IMAGE: 'ILLEGAL_IMAGE',
  OTHER: 'OTHER'
} as const;
export type PostcardReportReason = (typeof PostcardReportReason)[keyof typeof PostcardReportReason];

export const PostcardReportStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  VERIFIED: 'VERIFIED',
  REMOVED: 'REMOVED'
} as const;
export type PostcardReportStatus = (typeof PostcardReportStatus)[keyof typeof PostcardReportStatus];
