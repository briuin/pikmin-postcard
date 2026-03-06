import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PostcardCoordinateCopy } from '@/components/postcard-coordinate-copy';
import {
  resolveServerlessApiBaseUrl,
  shouldProxyToServerless
} from '@/lib/backend/backend-mode';
import { getPostcardTypeLabel } from '@/lib/postcard-type-label';
import { buildLocationLabel } from '@/lib/postcards/location-label';

type PageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = 'force-dynamic';

const DEFAULT_SITE_URL = 'https://pikmin.askans.app';

type SharedPostcardRecord = {
  id: string;
  title: string;
  notes: string | null;
  imageUrl: string | null;
  placeName: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  postcardType: string;
  locationStatus: string | null;
  aiConfidence: number | null;
  aiPlaceGuess: string | null;
  likeCount: number;
  dislikeCount: number;
  wrongLocationReports: number;
  uploaderName: string;
  createdAt: string;
};

function resolveBaseUrl(): URL {
  const candidates = [
    process.env.AUTH_URL,
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    DEFAULT_SITE_URL
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const normalized = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
    try {
      return new URL(normalized);
    } catch {
      continue;
    }
  }

  return new URL(DEFAULT_SITE_URL);
}

function toAbsoluteUrl(value: string): string {
  if (!value) {
    return value;
  }

  try {
    return new URL(value).toString();
  } catch {
    const base = resolveBaseUrl();
    const path = value.startsWith('/') ? value : `/${value}`;
    return new URL(path, base).toString();
  }
}

function resolveServerlessApiBase(): string {
  if (!shouldProxyToServerless()) {
    return '';
  }
  return resolveServerlessApiBaseUrl();
}

async function findSharedPostcardById(id: string) {
  const base = resolveServerlessApiBase();
  const endpoint = base
    ? `${base}/postcards/${encodeURIComponent(id)}`
    : new URL(`/api/postcards/${encodeURIComponent(id)}`, resolveBaseUrl()).toString();
  const response = await fetch(endpoint, {
    cache: 'no-store'
  });
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as Partial<SharedPostcardRecord>;
  if (!payload || typeof payload.id !== 'string') {
    return null;
  }

  return {
    id: payload.id,
    title: String(payload.title ?? 'Shared Postcard'),
    notes: payload.notes ?? null,
    imageUrl: payload.imageUrl ?? null,
    placeName: payload.placeName ?? null,
    city: payload.city ?? null,
    state: payload.state ?? null,
    country: payload.country ?? null,
    latitude: typeof payload.latitude === 'number' ? payload.latitude : null,
    longitude: typeof payload.longitude === 'number' ? payload.longitude : null,
    postcardType: String(payload.postcardType ?? 'UNKNOWN'),
    locationStatus: payload.locationStatus ?? null,
    aiConfidence: typeof payload.aiConfidence === 'number' ? payload.aiConfidence : null,
    aiPlaceGuess: payload.aiPlaceGuess ?? null,
    likeCount: Number(payload.likeCount ?? 0),
    dislikeCount: Number(payload.dislikeCount ?? 0),
    wrongLocationReports: Number(payload.wrongLocationReports ?? 0),
    uploaderName: String(payload.uploaderName ?? 'unknown uploader'),
    createdAt: String(payload.createdAt ?? new Date().toISOString())
  } satisfies SharedPostcardRecord;
}

function buildShareDescription(postcard: NonNullable<Awaited<ReturnType<typeof findSharedPostcardById>>>) {
  const location = buildLocationLabel(postcard, 'Unknown place');
  const typeLabel = getPostcardTypeLabel(postcard.postcardType);
  const rawNotes = postcard.notes?.trim() ?? '';
  const shortNotes =
    rawNotes.length > 120 ? `${rawNotes.slice(0, 117).trimEnd()}...` : rawNotes;

  return [location, `Type: ${typeLabel}`, shortNotes].filter(Boolean).join(' · ');
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!id) {
    return {
      title: 'Postcard not found | Pikmin Postcard',
      description: 'The shared postcard could not be found.'
    };
  }

  const postcard = await findSharedPostcardById(id);
  if (!postcard) {
    return {
      title: 'Postcard not found | Pikmin Postcard',
      description: 'The shared postcard could not be found.'
    };
  }

  const title = postcard.title?.trim() || 'Shared Postcard';
  const description = buildShareDescription(postcard);
  const canonicalUrl = toAbsoluteUrl(`/postcard/${postcard.id}`);
  const imageUrl = postcard.imageUrl ? toAbsoluteUrl(postcard.imageUrl) : undefined;

  return {
    title: `${title} | Pikmin Postcard`,
    description,
    alternates: {
      canonical: canonicalUrl
    },
    openGraph: {
      type: 'article',
      siteName: 'Pikmin Postcard',
      url: canonicalUrl,
      title,
      description,
      images: imageUrl
        ? [
            {
              url: imageUrl,
              alt: title
            }
          ]
        : undefined
    },
    twitter: {
      card: imageUrl ? 'summary_large_image' : 'summary',
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined
    }
  };
}

export default async function PostcardSharePage({ params }: PageProps) {
  const { id } = await params;
  if (!id) {
    notFound();
  }

  const postcard = await findSharedPostcardById(id);
  if (!postcard) {
    notFound();
  }
  const uploaderName = postcard.uploaderName;
  const createdAt = new Date(postcard.createdAt);
  const locationLabel = buildLocationLabel(postcard, 'Unknown place');
  const coordinateText =
    typeof postcard.latitude === 'number' && typeof postcard.longitude === 'number'
      ? `${postcard.latitude.toFixed(6)}, ${postcard.longitude.toFixed(6)}`
      : null;
  const isAiDetected =
    postcard.locationStatus === 'AUTO' ||
    postcard.locationStatus === 'USER_CONFIRMED' ||
    typeof postcard.aiConfidence === 'number' ||
    Boolean(postcard.aiPlaceGuess);

  return (
    <main className="mx-auto grid w-full max-w-[820px] gap-3 px-3 py-4">
      <article className="grid gap-3 rounded-[24px] border border-[#d7e8d8] bg-[radial-gradient(circle_at_12%_8%,rgba(244,199,66,0.2),transparent_35%),radial-gradient(circle_at_90%_15%,rgba(78,142,247,0.16),transparent_35%),linear-gradient(170deg,#fbfffc,#f3fff4)] p-3.5 shadow-[0_20px_38px_rgba(25,46,36,0.18)]">
        <div className="flex items-start justify-between gap-2">
          <div className="grid gap-1">
            <span className="inline-flex w-fit items-center rounded-full border border-[#d5e7d6] bg-[#f4fff4] px-2.5 py-1 text-[0.72rem] font-black uppercase tracking-[0.08em] text-[#2b6442]">
              Shared Postcard
            </span>
            <div className="flex min-w-0 items-start gap-1.5">
              {isAiDetected ? (
                <span className="inline-flex shrink-0 items-center rounded-full border border-[#c6d9ff] bg-[#e9f1ff] px-1.5 py-0.5 text-[0.65rem] font-black uppercase tracking-[0.06em] text-[#365da6]">
                  AI
                </span>
              ) : null}
              <h1 className="min-w-0 [overflow-wrap:anywhere] text-[1.2rem] leading-tight text-[#183122]">
                {postcard.title}
              </h1>
            </div>
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
            {locationLabel}
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
