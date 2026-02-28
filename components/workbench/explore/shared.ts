import type { MapViewportBounds, SavedMapMarker } from '@/components/open-map';
import type { WorkbenchText } from '@/lib/i18n';
import type { ExploreSort, PostcardRecord } from '@/components/workbench/types';

export type ExploreFeedbackAction = 'like' | 'dislike' | 'report';

type FeedbackResult = 'added' | 'removed' | 'switched' | 'already_reported';

type FeedbackMessageText = Pick<
  WorkbenchText,
  | 'feedbackThanksLike'
  | 'feedbackLikeRemoved'
  | 'feedbackDislikeRecorded'
  | 'feedbackDislikeRemoved'
  | 'feedbackWrongLocation'
  | 'feedbackReportAlreadySubmitted'
>;

export function buildPublicMarkers(postcards: PostcardRecord[]): SavedMapMarker[] {
  return postcards
    .filter((postcard) => typeof postcard.latitude === 'number' && typeof postcard.longitude === 'number')
    .map((postcard) => ({
      id: postcard.id,
      title: postcard.title,
      latitude: postcard.latitude as number,
      longitude: postcard.longitude as number,
      placeName: postcard.placeName,
      imageUrl: postcard.imageUrl,
      notes: postcard.notes,
      createdAt: postcard.createdAt,
      locationStatus: postcard.locationStatus,
      aiConfidence: postcard.aiConfidence,
      aiPlaceGuess: postcard.aiPlaceGuess,
      locationModelVersion: postcard.locationModelVersion,
      uploaderName: postcard.uploaderName ?? null,
      likeCount: postcard.likeCount ?? 0,
      dislikeCount: postcard.dislikeCount ?? 0,
      wrongLocationReports: postcard.wrongLocationReports ?? 0
    }));
}

export function areBoundsNearlyEqual(
  current: MapViewportBounds,
  next: MapViewportBounds,
  threshold = 0.0001
): boolean {
  return (
    Math.abs(current.north - next.north) < threshold &&
    Math.abs(current.south - next.south) < threshold &&
    Math.abs(current.east - next.east) < threshold &&
    Math.abs(current.west - next.west) < threshold
  );
}

export function buildPublicPostcardsParams(args: {
  mapBounds: MapViewportBounds;
  exploreSort: ExploreSort;
  exploreLimit: number;
  searchText: string;
}): URLSearchParams {
  const params = new URLSearchParams({
    sort: args.exploreSort,
    limit: String(args.exploreLimit),
    north: String(args.mapBounds.north),
    south: String(args.mapBounds.south),
    east: String(args.mapBounds.east),
    west: String(args.mapBounds.west)
  });

  const query = args.searchText.trim();
  if (query) {
    params.set('q', query);
  }

  return params;
}

export function getFeedbackStatusMessage(
  text: FeedbackMessageText,
  action: ExploreFeedbackAction,
  result: FeedbackResult
): string {
  if (action === 'like') {
    return result === 'removed' ? text.feedbackLikeRemoved : text.feedbackThanksLike;
  }
  if (action === 'dislike') {
    return result === 'removed' ? text.feedbackDislikeRemoved : text.feedbackDislikeRecorded;
  }
  if (result === 'already_reported') {
    return text.feedbackReportAlreadySubmitted;
  }
  return text.feedbackWrongLocation;
}
