import { NextResponse } from 'next/server';
import {
  requireApprovedDetectionSubmitter,
  requireAuthenticatedUserId
} from '@/lib/api-guards';
import {
  listDetectionJobsForUser,
  processDetectionJob,
  queueDetectionJob
} from '@/lib/location-detection/jobs';
import { requireImageFileFromRequest } from '@/lib/request-image';
import {
  buildUploadedFileActionMetadata,
  recordUserAction
} from '@/lib/user-action-log';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const guard = await requireAuthenticatedUserId({ createIfMissing: true });
  if (!guard.ok) {
    return guard.response;
  }
  const userId = guard.value;

  await recordUserAction({
    request,
    userId,
    action: 'DETECTION_JOB_LIST'
  });

  const jobs = await listDetectionJobsForUser(userId);
  return NextResponse.json(jobs, { status: 200 });
}

export async function POST(request: Request) {
  const guard = await requireApprovedDetectionSubmitter();
  if (!guard.ok) {
    return guard.response;
  }
  const actor = guard.value;

  try {
    const imageFile = await requireImageFileFromRequest(request);
    if (!imageFile.ok) {
      return imageFile.response;
    }
    const { file } = imageFile;

    await recordUserAction({
      request,
      userId: actor.id,
      action: 'DETECTION_JOB_SUBMIT',
      metadata: buildUploadedFileActionMetadata(file)
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
