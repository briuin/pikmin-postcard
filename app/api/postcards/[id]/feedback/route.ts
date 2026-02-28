import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApprovedVoter } from '@/lib/api-guards';
import {
  submitPostcardFeedback,
  type FeedbackInputAction
} from '@/lib/postcards/feedback-mutations';
import { recordUserAction } from '@/lib/user-action-log';

const feedbackSchema = z.object({
  action: z.enum(['like', 'dislike', 'report_wrong_location'])
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const guard = await requireApprovedVoter();
  if (!guard.ok) {
    return guard.response;
  }
  const actor = guard.value;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing postcard id.' }, { status: 400 });
  }

  try {
    const body = feedbackSchema.parse(await request.json()) as {
      action: FeedbackInputAction;
    };
    await recordUserAction({
      request,
      userId: actor.id,
      action: 'POSTCARD_FEEDBACK',
      metadata: {
        postcardId: id,
        feedbackAction: body.action
      }
    });

    const postcard = await submitPostcardFeedback({
      postcardId: id,
      userId: actor.id,
      action: body.action
    });

    if (!postcard) {
      return NextResponse.json({ error: 'Postcard not found.' }, { status: 404 });
    }

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
