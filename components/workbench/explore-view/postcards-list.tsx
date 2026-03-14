import Image from 'next/image';
import { isAiDetected } from '@/components/workbench/explore-view/helpers';
import {
  exploreResultsClassName,
  postcardItemClassName
} from '@/components/workbench/explore-view/styles';
import type { ExplorePostcardsListProps } from '@/components/workbench/explore-view/types';
import { getPostcardTypeBadgeClassName, getPostcardTypeLabel } from '@/lib/postcard-type-label';

export function ExplorePostcardsList({
  text,
  visiblePostcards,
  focusedMarkerId,
  onSelectPostcardId
}: ExplorePostcardsListProps) {
  return (
    <div className={exploreResultsClassName}>
      {visiblePostcards.map((postcard) => {
        const cardClassName = [
          postcardItemClassName,
          focusedMarkerId === postcard.id ? 'border-[#7ecb95] ring-2 ring-[rgba(86,179,106,0.2)]' : '',
          'shrink-0',
          'cursor-pointer hover:border-[#95d7a7] hover:ring-2 hover:ring-[rgba(86,179,106,0.16)] focus-visible:outline-2 focus-visible:outline-[rgba(86,179,106,0.45)] focus-visible:outline-offset-2'
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <article
            key={postcard.id}
            className={cardClassName}
            onClick={() => onSelectPostcardId(postcard.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectPostcardId(postcard.id);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={text.exploreOpenDetailsAria(postcard.title)}
          >
            <div className="flex items-center gap-2">
              {postcard.imageUrl ? (
                <Image
                  className="h-12 w-16 shrink-0 rounded-[8px] border border-[#deeadb] object-cover"
                  src={postcard.imageUrl}
                  alt={postcard.title}
                  width={160}
                  height={120}
                />
              ) : null}
              <div className="min-w-0 flex-1 grid gap-0.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  {isAiDetected(postcard) ? (
                    <span className="inline-flex shrink-0 items-center rounded-full border border-[#c6d9ff] bg-[#e9f1ff] px-1.5 py-0.5 text-[0.65rem] font-black uppercase tracking-[0.06em] text-[#365da6]">
                      AI
                    </span>
                  ) : null}
                  <strong className="min-w-0 truncate">{postcard.title}</strong>
                </div>
                <div className="flex flex-wrap gap-1">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${getPostcardTypeBadgeClassName(
                      postcard.postcardType
                    )}`}
                  >
                    {getPostcardTypeLabel(postcard.postcardType, text)}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-[#d5e8d8] bg-[#f6fff7] px-2 py-0.5 text-[0.68rem] font-semibold text-[#355848]">
                    👍 {postcard.likeCount}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-[#d5e8d8] bg-[#f6fff7] px-2 py-0.5 text-[0.68rem] font-semibold text-[#355848]">
                    👎 {postcard.dislikeCount}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-[#d5e8d8] bg-[#f6fff7] px-2 py-0.5 text-[0.68rem] font-semibold text-[#355848]">
                    ⚠️ {postcard.wrongLocationReports}
                  </span>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
