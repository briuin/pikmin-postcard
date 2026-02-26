import { LocationStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const postcardCreateSchema = z.object({
  title: z.string().min(1),
  notes: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  city: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  placeName: z.string().max(180).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  aiLatitude: z.number().min(-90).max(90).optional(),
  aiLongitude: z.number().min(-180).max(180).optional(),
  aiConfidence: z.number().min(0).max(1).optional(),
  aiPlaceGuess: z.string().max(180).optional(),
  locationStatus: z.nativeEnum(LocationStatus).optional(),
  locationModelVersion: z.string().max(100).optional()
});

function maskEmail(email: string | null | undefined): string | null {
  if (!email) {
    return null;
  }

  const parts = email.split('@');
  if (parts.length !== 2) {
    return 'hidden';
  }

  const [local, domain] = parts;
  const maskedLocal = local.length <= 2 ? `${local[0] ?? '*'}*` : `${local.slice(0, 2)}***`;

  const domainParts = domain.split('.');
  const root = domainParts[0] ?? '';
  const tld = domainParts.slice(1).join('.') || '***';
  const maskedRoot = root.length <= 1 ? '*' : `${root[0]}***`;

  return `${maskedLocal}@${maskedRoot}.${tld}`;
}

function serializePostcards(
  postcards: Array<{
    user?: { email: string } | null;
    [key: string]: unknown;
  }>
) {
  return postcards.map((postcard) => {
    const { user, ...rest } = postcard;
    return {
      ...rest,
      uploaderMasked: maskEmail(user?.email)
    };
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mineOnly = url.searchParams.get('mine') === '1';

  if (mineOnly) {
    const session = await auth();
    const userEmail = session?.user?.email;
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json([], { status: 200 });
    }

    const postcards = await prisma.postcard.findMany({
      where: {
        userId: user.id,
        deletedAt: null
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { email: true }
        },
        tags: {
          include: { tag: true }
        }
      },
      take: 200
    });

    return NextResponse.json(serializePostcards(postcards), { status: 200 });
  }

  const postcards = await prisma.postcard.findMany({
    where: {
      deletedAt: null
    },
    orderBy: {
      createdAt: 'desc'
    },
    include: {
      user: {
        select: { email: true }
      },
      tags: {
        include: {
          tag: true
        }
      }
    },
    take: 200
  });

  return NextResponse.json(serializePostcards(postcards), { status: 200 });
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    const userEmail = session?.user?.email;
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const body = postcardCreateSchema.parse(await request.json());

    const user = await prisma.user.upsert({
      where: { email: userEmail },
      update: {},
      create: { email: userEmail }
    });

    const postcard = await prisma.postcard.create({
      data: {
        userId: user.id,
        title: body.title,
        notes: body.notes,
        imageUrl: body.imageUrl,
        city: body.city,
        country: body.country,
        placeName: body.placeName,
        latitude: body.latitude,
        longitude: body.longitude,
        aiLatitude: body.aiLatitude,
        aiLongitude: body.aiLongitude,
        aiConfidence: body.aiConfidence,
        aiPlaceGuess: body.aiPlaceGuess,
        locationStatus: body.locationStatus ?? LocationStatus.AUTO,
        locationModelVersion: body.locationModelVersion ?? process.env.GEMINI_MODEL ?? 'unknown'
      }
    });

    return NextResponse.json(postcard, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Invalid postcard payload.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 400 }
    );
  }
}
