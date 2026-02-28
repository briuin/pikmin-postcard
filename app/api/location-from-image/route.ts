import { NextResponse } from 'next/server';
import { getAuthenticatedUser, getAuthenticatedUserId, isApprovedUser } from '@/lib/api-auth';
import {
  listDetectionJobsForUser,
  processDetectionJob,
  queueDetectionJob
} from '@/lib/location-detection/jobs';
import { recordUserAction } from '@/lib/user-action-log';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId({ createIfMissing: true });
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  await recordUserAction({
    request,
    userId,
    action: 'DETECTION_JOB_LIST'
  });

  const jobs = await listDetectionJobsForUser(userId);
  return NextResponse.json(jobs, { status: 200 });
}

export async function POST(request: Request) {
  const actor = await getAuthenticatedUser({ createIfMissing: true });
  if (!actor) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!isApprovedUser(actor)) {
    return NextResponse.json({ error: 'Account pending approval.' }, { status: 403 });
  }
  if (!actor.canSubmitDetection) {
    return NextResponse.json(
      { error: 'You are not allowed to submit AI detection jobs.' },
      { status: 403 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('image');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing image file.' }, { status: 400 });
    }

    await recordUserAction({
      request,
      userId: actor.id,
      action: 'DETECTION_JOB_SUBMIT',
      metadata: {
        fileName: file.name,
        mimeType: file.type,
        size: file.size
      }
    });

    const queued = await queueDetectionJob({
      userId: actor.id,
      file
    });

    void processDetectionJob(queued.processParams);

    return NextResponse.json(
      {
        id: queued.id,
        status: queued.status,
        imageUrl: queued.imageUrl,
        message: 'Detection job queued. Check your dashboard for result.'
      },
      { status: 202 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to queue location detection.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
