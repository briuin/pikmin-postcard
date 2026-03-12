export const PlantPathVisibility = {
  PRIVATE: 'PRIVATE',
  PUBLIC: 'PUBLIC'
} as const;

export type PlantPathVisibility = (typeof PlantPathVisibility)[keyof typeof PlantPathVisibility];

export type PlantPathCoordinate = {
  id: string;
  latitude: number;
  longitude: number;
};

export type PlantPathRecord = {
  id: string;
  ownerUserId: string;
  ownerName: string;
  name: string;
  visibility: PlantPathVisibility;
  coordinates: PlantPathCoordinate[];
  createdAt: string;
  updatedAt: string;
  isOwnedByViewer: boolean;
  isSavedByViewer: boolean;
  sourcePathId: string | null;
};

export type PlantPathListPayload = {
  ownedPaths: PlantPathRecord[];
  savedPaths: PlantPathRecord[];
  publicPaths: PlantPathRecord[];
};
