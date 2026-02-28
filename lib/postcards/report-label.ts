type ReportStatus = 'PENDING' | 'IN_PROGRESS' | 'VERIFIED' | 'REMOVED';

type ReportReasonLabels = {
  wrongLocation: string;
  spam: string;
  illegalImage: string;
  other: string;
};

type ReportStatusLabels = {
  pending: string;
  inProgress: string;
  verified: string;
  removed: string;
};

export function getReportReasonLabel(reason: string, labels: ReportReasonLabels): string {
  if (reason === 'SPAM') {
    return labels.spam;
  }
  if (reason === 'ILLEGAL_IMAGE') {
    return labels.illegalImage;
  }
  if (reason === 'OTHER') {
    return labels.other;
  }
  return labels.wrongLocation;
}

export function getReportStatusLabel(
  status: ReportStatus | string | null | undefined,
  labels: ReportStatusLabels
): string {
  if (status === 'IN_PROGRESS') {
    return labels.inProgress;
  }
  if (status === 'VERIFIED') {
    return labels.verified;
  }
  if (status === 'REMOVED') {
    return labels.removed;
  }
  return labels.pending;
}
