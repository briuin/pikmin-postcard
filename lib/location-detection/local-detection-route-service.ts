import { NextResponse } from 'next/server';
import { apiError, getUnknownErrorDetails } from '@/lib/backend/contracts';
import {
  listDetectionJobsForUser,
  processDetectionJob,
  queueDetectionJob
} from '@/lib/location-detection/jobs';
import { requireImageFileWithUploadAction } from '@/lib/request-image';
import { recordUserAction } from '@/lib/user-action-log';

export async function listDetectionJobsLocal(args: {
  request: Request;
  userId: string;
}): Promise<NextResponse> {
  const { request, userId } = args;
  await recordUserAction({
    request,
    userId,
    action: 'DETECTION_JOB_LIST'
  });

  const jobs = await listDetectionJobsForUser(userId);
  return NextResponse.json(jobs, { status: 200 });
}

export async function submitDetectionJobLocal(args: {
  request: Request;
  actorId: string;
}): Promise<NextResponse> {
  const { request, actorId } = args;
  try {
    const imageFile = await requireImageFileWithUploadAction({
      request,
      userId: actorId,
      action: 'DETECTION_JOB_SUBMIT'
    });
    if (!imageFile.ok) {
      return imageFile.response;
    }
    const { file } = imageFile;

    const queued = await queueDetectionJob({
      userId: actorId,
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
    return apiError(500, 'Failed to queue location detection.', getUnknownErrorDetails(error));
  }
}
