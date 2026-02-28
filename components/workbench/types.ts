import type { SavedMapMarker } from '@/components/open-map';

export type PostcardType = 'MUSHROOM' | 'FLOWER' | 'EXPLORATION' | 'UNKNOWN';

export type PostcardRecord = {
  id: string;
  title: string;
  postcardType: PostcardType;
  notes: string | null;
  placeName: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
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
  uploaderName?: string | null;
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

export type PostcardEditDraft = {
  title: string;
  postcardType: PostcardType;
  notes: string;
  placeName: string;
  locationInput: string;
};

export type ExploreSort = 'ranking' | 'newest' | 'likes' | 'reports';
export type DashboardViewMode = 'grid' | 'list';

export type PublicMarkers = SavedMapMarker[];
