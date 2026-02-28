import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PostcardCoordinateCopy } from '@/components/postcard-coordinate-copy';
import { getPostcardTypeLabel } from '@/lib/postcard-type-label';
import { findPostcardsForList } from '@/lib/postcards/repository';
import { maskEmail } from '@/lib/postcards/shared';

type PageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = 'force-dynamic';

export default async function PostcardSharePage({ params }: PageProps) {
  const { id } = await params;
  if (!id) {
    notFound();
  }

  const rows = await findPostcardsForList({
    where: {
      id,
      deletedAt: null
    },
    take: 1
  });

  if (rows.length === 0) {
    notFound();
  }

  const postcard = rows[0];
  const uploaderName =
    postcard.user?.displayName?.trim() || maskEmail(postcard.user?.email);
  const createdAt = postcard.createdAt;
  const coordinateText =
    typeof postcard.latitude === 'number' && typeof postcard.longitude === 'number'
      ? `${postcard.latitude.toFixed(6)}, ${postcard.longitude.toFixed(6)}`
      : null;

  return (
    <main className="mx-auto grid w-full max-w-[820px] gap-3 px-3 py-4">
      <article className="grid gap-3 rounded-[24px] border border-[#d7e8d8] bg-[radial-gradient(circle_at_12%_8%,rgba(244,199,66,0.2),transparent_35%),radial-gradient(circle_at_90%_15%,rgba(78,142,247,0.16),transparent_35%),linear-gradient(170deg,#fbfffc,#f3fff4)] p-3.5 shadow-[0_20px_38px_rgba(25,46,36,0.18)]">
        <div className="flex items-start justify-between gap-2">
          <div className="grid gap-1">
            <span className="inline-flex w-fit items-center rounded-full border border-[#d5e7d6] bg-[#f4fff4] px-2.5 py-1 text-[0.72rem] font-black uppercase tracking-[0.08em] text-[#2b6442]">
              Shared Postcard
            </span>
            <h1 className="text-[1.2rem] leading-tight text-[#183122]">{postcard.title}</h1>
          </div>
          <Link
            href="/"
            className="rounded-full border border-[#d3e6d2] bg-white px-3 py-1 text-[0.82rem] font-bold text-[#2f5545] no-underline shadow-[0_3px_8px_rgba(35,63,51,0.12)]"
          >
            Open Explore
          </Link>
        </div>

        {postcard.imageUrl ? (
          <Image
            src={postcard.imageUrl}
            alt={postcard.title}
            width={1200}
            height={860}
            className="h-auto max-h-[520px] w-full rounded-[14px] border border-[#d7e7d9] bg-[#eef6f0] object-cover"
          />
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center rounded-full border border-[#d5e8d8] bg-[#f6fff7] px-2.5 py-1 text-[0.8rem] font-semibold text-[#36594a]">
            Type: {getPostcardTypeLabel(postcard.postcardType)}
          </span>
          <span className="inline-flex items-center rounded-full border border-[#d5e8d8] bg-[#f6fff7] px-2.5 py-1 text-[0.8rem] font-semibold text-[#36594a]">
            {postcard.placeName || 'Unknown place'}
          </span>
          {uploaderName ? (
            <span className="inline-flex items-center rounded-full border border-[#d5e8d8] bg-[#f6fff7] px-2.5 py-1 text-[0.8rem] font-semibold text-[#36594a]">
              by {uploaderName}
            </span>
          ) : null}
          <span className="inline-flex items-center rounded-full border border-[#d5e8d8] bg-[#f6fff7] px-2.5 py-1 text-[0.8rem] font-semibold text-[#36594a]">
            {createdAt.toLocaleString()}
          </span>
          <span className="inline-flex items-center rounded-full border border-[#d5e8d8] bg-[#f6fff7] px-2.5 py-1 text-[0.8rem] font-semibold text-[#36594a]">
            👍 {Number(postcard.likeCount ?? 0)} · 👎 {Number(postcard.dislikeCount ?? 0)} · ⚠️ {Number(postcard.wrongLocationReports ?? 0)}
          </span>
        </div>

        <div className="grid gap-1.5 rounded-[14px] border border-[#d8e8da] bg-[linear-gradient(145deg,#f3fff5,#edf8ff)] p-2.5">
          <strong className="text-[0.9rem] text-[#2c4d3f]">Location</strong>
          <div className="flex items-center gap-2 max-[560px]:flex-wrap">
            <small className="min-w-0 break-all text-[0.86rem] text-[#47665a]">
              {coordinateText ?? 'No coordinates available'}
            </small>
            <PostcardCoordinateCopy coordinates={coordinateText} />
          </div>
        </div>

        {postcard.notes ? (
          <p className="m-0 rounded-[14px] border border-[#dae9dc] bg-[#f8fffa] px-3 py-2.5 text-[0.92rem] leading-relaxed text-[#365347]">
            {postcard.notes}
          </p>
        ) : null}
      </article>
    </main>
  );
}
