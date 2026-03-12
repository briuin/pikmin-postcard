import type { PercentCrop } from 'react-image-crop';
import type { WorkbenchText } from '@/lib/i18n';
import type {
  DashboardViewMode,
  DashboardReportRecord,
  DetectionJobRecord,
  PostcardEditDraft,
  PostcardRecord
} from '@/components/workbench/types';
import type { CropDraft } from '@/components/workbench/utils';

export type DashboardSectionProps = {
  text: WorkbenchText;
  isAuthenticated: boolean;
  jobs: DetectionJobRecord[];
  myPostcards: PostcardRecord[];
  savedPostcards: PostcardRecord[];
  myReports: DashboardReportRecord[];
  postcardDrafts: Record<string, PostcardEditDraft>;
  savingJobId: string | null;
  savingPostcardId: string | null;
  deletingPostcardId: string | null;
  editingCropPostcardId: string | null;
  editingCropOriginalUrl: string | null;
  cropDraft: CropDraft;
  savingCropPostcardId: string | null;
  isLoadingJobs: boolean;
  isLoadingMine: boolean;
  isLoadingSaved: boolean;
  isLoadingReports: boolean;
  cancelingReportId: string | null;
  dashboardStatus: string;
  dashboardViewMode: DashboardViewMode;
  onSignIn: () => void;
  onSetDashboardViewMode: (mode: DashboardViewMode) => void;
  onRefresh: () => void;
  onUpdatePostcardDraft: (postcardId: string, patch: Partial<PostcardEditDraft>) => void;
  onSaveDetectedJob: (job: DetectionJobRecord) => void;
  onSavePostcard: (postcard: PostcardRecord) => void;
  isJobAlreadySaved: (job: DetectionJobRecord) => boolean;
  onOpenCropEditor: (postcard: PostcardRecord) => void;
  onSaveCrop: (postcardId: string) => void;
  onCloseCropEditor: () => void;
  onSoftDelete: (postcard: PostcardRecord) => void;
  onCropChange: (crop: PercentCrop) => void;
  onCancelReport: (report: DashboardReportRecord) => void;
};

export type PreviewImage = {
  src: string;
  alt: string;
};

export type DashboardCategory = 'ai' | 'postcards' | 'saved' | 'reports';
