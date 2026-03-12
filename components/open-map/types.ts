export type SavedMapMarker = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  placeName?: string | null;
  imageUrl?: string | null;
  notes?: string | null;
  createdAt?: string;
  locationStatus?: 'AUTO' | 'USER_CONFIRMED' | 'MANUAL';
  aiConfidence?: number | null;
  aiPlaceGuess?: string | null;
  locationModelVersion?: string | null;
  uploaderName?: string | null;
  likeCount?: number;
  dislikeCount?: number;
  wrongLocationReports?: number;
};

export type MapViewportBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type DraftPoint = {
  latitude: number;
  longitude: number;
  label: string;
};

export type ViewerPoint = {
  latitude: number;
  longitude: number;
  label?: string;
  accuracy?: number;
};

export type OpenMapProps = {
  draftPoint?: DraftPoint;
  viewerPoint?: ViewerPoint;
  markers?: SavedMapMarker[];
  polylines?: Array<{
    id: string;
    points: Array<{ latitude: number; longitude: number }>;
    color?: string;
  }>;
  focusedMarkerId?: string | null;
  viewerFocusSignal?: number;
  onLocateRequest?: () => Promise<boolean> | boolean;
  isLocating?: boolean;
  onViewportChange?: (bounds: MapViewportBounds, zoom: number) => void;
  onPick?: (lat: number, lng: number) => void;
  className?: string;
  simpleMarkerPopup?: boolean;
};
