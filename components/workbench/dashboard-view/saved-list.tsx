'use client';

import Image from 'next/image';
import type { WorkbenchText } from '@/lib/i18n';
import { buildLocationLabel } from '@/lib/postcards/location-label';
import type { PostcardRecord } from '@/components/workbench/types';
import type { PreviewImage } from '@/components/workbench/dashboard-view/types';
import {
  postcardItemClassName,
  postcardItemHeadClassName,
  smallMutedClassName
} from '@/components/workbench/dashboard-view/styles';

type DashboardSavedListProps = {
  text: WorkbenchText;
  savedPostcards: PostcardRecord[];
  isLoadingSaved: boolean;
  dashboardListClassName: string;
  onPreviewImage: (image: PreviewImage) => void;
};

export function DashboardSavedList({
  text,
  savedPostcards,
  isLoadingSaved,
  dashboardListClassName,
  onPreviewImage
}: DashboardSavedListProps) {
  return (
    <>
      <h3 className="mt-1">{text.dashboardSavedTitle}</h3>
      {isLoadingSaved ? <small className={smallMutedClassName}>{text.dashboardSavedLoading}</small> : null}
      {!isLoadingSaved && savedPostcards.length === 0 ? (
        <small className={smallMutedClassName}>{text.dashboardSavedEmpty}</small>
      ) : null}
      <div className={dashboardListClassName}>
        {savedPostcards.slice(0, 60).map((postcard) => {
          const locationLabel = buildLocationLabel(postcard, text.exploreUnknownPlace);
          return (
            <article key={postcard.id} className={postcardItemClassName}>
              <div className={postcardItemHeadClassName}>
                <strong>{postcard.title}</strong>
                <small className={smallMutedClassName}>
                  {new Date(postcard.createdAt).toLocaleDateString(text.dateLocale)}
                </small>
              </div>
              {postcard.imageUrl ? (
                <button
                  type="button"
                  className="cursor-zoom-in rounded-[10px] border-0 bg-transparent p-0"
                  onClick={() => onPreviewImage({ src: postcard.imageUrl as string, alt: postcard.title })}
                >
                  <Image
                    className="h-auto max-h-[180px] w-full rounded-[10px] border border-[#deeadb] object-cover"
                    src={postcard.imageUrl as string}
                    alt={postcard.title}
                    width={640}
                    height={420}
                  />
                </button>
              ) : null}
              <small className={smallMutedClassName}>{locationLabel}</small>
              <div className="flex flex-wrap gap-1">
                {postcard.viewerFeedback?.favorited ? (
                  <span className="inline-flex items-center rounded-full border border-[#d4b15f] bg-[#fff2c8] px-2 py-0.5 text-[0.72rem] font-bold text-[#6f511a]">
                    ★ {text.dashboardSavedFavoriteBadge}
                  </span>
                ) : null}
                {postcard.viewerFeedback?.collected ? (
                  <span className="inline-flex items-center rounded-full border border-[#bcd9e6] bg-[#e9f7ff] px-2 py-0.5 text-[0.72rem] font-bold text-[#2f5f74]">
                    🔖 {text.dashboardSavedCollectedBadge}
                  </span>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
