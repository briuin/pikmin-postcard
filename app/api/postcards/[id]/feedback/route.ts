import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const feedbackSchema = z.object({
  action: z.enum(['like', 'dislike', 'report_wrong_location'])
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing postcard id.' }, { status: 400 });
  }

  try {
    const body = feedbackSchema.parse(await request.json());

    const updateData =
      body.action === 'like'
        ? { likeCount: { increment: 1 } }
        : body.action === 'dislike'
          ? { dislikeCount: { increment: 1 } }
          : { wrongLocationReports: { increment: 1 } };

    const result = await prisma.postcard.updateMany({
      where: {
        id,
        deletedAt: null
      },
      data: updateData
    });

    if (result.count === 0) {
      return NextResponse.json({ error: 'Postcard not found.' }, { status: 404 });
    }

    const postcard = await prisma.postcard.findUnique({
      where: { id },
      select: {
        id: true,
        likeCount: true,
        dislikeCount: true,
        wrongLocationReports: true
      }
    });

    return NextResponse.json(postcard, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to submit feedback.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 400 }
    );
  }
}
