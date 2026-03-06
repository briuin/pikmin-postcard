import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, getUnknownErrorDetails } from '@/lib/backend/contracts';
import { ddbDoc, ddbTables, newId, nowIso } from '@/lib/repos/dynamodb/shared';
import { recordUserAction } from '@/lib/user-action-log';

const feedbackCreateSchema = z.object({
  subject: z.string().trim().min(2).max(120),
  message: z.string().trim().min(10).max(5000)
});

export async function createFeedbackLocal(args: {
  request: Request;
  actorId: string;
}): Promise<NextResponse> {
  const { request, actorId } = args;
  try {
    const body = feedbackCreateSchema.parse(await request.json());
    await recordUserAction({
      request,
      userId: actorId,
      action: 'FEEDBACK_SUBMIT',
      metadata: {
        subjectLength: body.subject.length,
        messageLength: body.message.length
      }
    });
    const createdAt = nowIso();
    const created = {
      id: newId('fbm'),
      userId: actorId,
      subject: body.subject,
      message: body.message,
      status: 'OPEN',
      createdAt,
      updatedAt: createdAt
    };

    await ddbDoc.send(
      new PutCommand({
        TableName: ddbTables.feedbackMessages,
        Item: created
      })
    );

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return apiError(400, 'Invalid feedback payload.', getUnknownErrorDetails(error));
  }
}
