import type { SavedMapMarker } from '@/components/open-map';

export type PostcardRecord = {
  id: string;
  title: string;
  notes: string | null;
  placeName: string | null;
  imageUrl: string | null;
  originalImageUrl?: string | null;
  latitude: number | null;
  longitude: number | null;
  aiConfidence: number | null;
  aiPlaceGuess: string | null;
  likeCount: number;
  dislikeCount: number;
  wrongLocationReports: number;
  locationStatus: 'AUTO' | 'USER_CONFIRMED' | 'MANUAL';
  locationModelVersion: string | null;
  uploaderMasked?: string | null;
  viewerFeedback?: {
    liked: boolean;
    disliked: boolean;
    reportedWrongLocation: boolean;
  };
  createdAt: string;
};

export type PublicPostcardsPayload = {
  items: PostcardRecord[];
  total: number;
  hasMore: boolean;
  limit: number;
  sort: 'ranking' | 'newest' | 'likes' | 'reports';
};

export type DetectionJobRecord = {
  id: string;
  imageUrl: string;
  status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  latitude: number | null;
  longitude: number | null;
  confidence: number | null;
  placeGuess: string | null;
  modelVersion: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type GeoPermissionState = 'checking' | 'prompt' | 'granted' | 'denied' | 'unsupported';

export type DeviceLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export type DetectionDraft = {
  title: string;
  notes: string;
  locationInput: string;
};

export type PostcardEditDraft = {
  title: string;
  notes: string;
  placeName: string;
  locationInput: string;
};

export type ExploreSort = 'ranking' | 'newest' | 'likes' | 'reports';
export type DashboardViewMode = 'grid' | 'list';

export type PublicMarkers = SavedMapMarker[];
