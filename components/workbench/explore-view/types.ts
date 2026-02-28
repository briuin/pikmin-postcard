import type { WorkbenchText } from '@/lib/i18n';
import type { ExploreSort, PostcardRecord } from '@/components/workbench/types';

export type ExploreToast = {
  message: string;
  tone: 'success' | 'error';
};

export type ExploreSummaryProps = {
  text: WorkbenchText;
  visiblePostcardsCount: number;
  publicMarkerCount: number;
  visibleTotal: number;
  visibleHasMore: boolean;
  exploreLimit: number;
};

export type ExploreFiltersProps = {
  text: WorkbenchText;
  exploreSort: ExploreSort;
  searchText: string;
  exploreLimit: number;
  onSearchChange: (value: string) => void;
  onSortChange: (value: ExploreSort) => void;
  onLimitChange: (value: number) => void;
};

export type ExploreStatusStripProps = {
  text: WorkbenchText;
  mapBoundsLoaded: boolean;
  isLoadingPublic: boolean;
  visiblePostcardsCount: number;
  exploreStatus: string;
};

export type ExplorePostcardsListProps = {
  text: WorkbenchText;
  visiblePostcards: PostcardRecord[];
  focusedMarkerId: string | null;
  onSelectPostcardId: (postcardId: string) => void;
};

export type ExplorePostcardModalProps = {
  text: WorkbenchText;
  isAuthenticated: boolean;
  postcard: PostcardRecord;
  feedbackPendingKey: string | null;
  onClose: () => void;
  onSubmitFeedback: (postcardId: string, action: 'like' | 'dislike' | 'report_wrong_location') => void;
  onCopyCoordinates: (postcard: PostcardRecord) => Promise<void>;
  onCopyShareLink: (postcard: PostcardRecord) => Promise<void>;
  onSignIn: () => void;
};
