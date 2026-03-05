import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApprovedVoter, withGuardedValue } from '@/lib/api-guards';
import { proxyExternalApiRequest } from '@/lib/external-api-proxy';
import {
  type FeedbackReportReasonInput,
  submitPostcardFeedback,
  type FeedbackInputAction
} from '@/lib/postcards/feedback-mutations';
import { recordUserAction } from '@/lib/user-action-log';

const feedbackSchema = z.object({
  action: z.enum(['like', 'dislike', 'favorite', 'collected', 'report', 'report_wrong_location']),
  reason: z.enum(['wrong_location', 'spam', 'illegal_image', 'other']).optional(),
  description: z.string().trim().max(1200).optional()
}).superRefine((payload, ctx) => {
  if ((payload.action === 'report' || payload.action === 'report_wrong_location') && !payload.reason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reason'],
      message: 'Reason is required when reporting.'
    });
  }
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id: postcardId } = await context.params;
  if (!postcardId) {
    return NextResponse.json({ error: 'Missing postcard id.' }, { status: 400 });
  }

  const proxied = await proxyExternalApiRequest({
    request,
    path: `/postcards/${encodeURIComponent(postcardId)}/feedback`
  });
  if (proxied) {
    return proxied;
  }

  return withGuardedValue(requireApprovedVoter(), async (actor) => {
    try {
      const body = feedbackSchema.parse(await request.json()) as {
        action: FeedbackInputAction;
        reason?: FeedbackReportReasonInput;
        description?: string;
      };
      await recordUserAction({
        request,
        userId: actor.id,
        action: 'POSTCARD_FEEDBACK',
        metadata: {
          postcardId,
          feedbackAction: body.action,
          reportReason: body.reason ?? null
        }
      });

      const postcard = await submitPostcardFeedback({
        postcardId,
        userId: actor.id,
        action: body.action,
        reportReason: body.reason,
        reportDescription: body.description ?? null
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
  });
}
