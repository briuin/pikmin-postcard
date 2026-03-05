import { NextResponse } from 'next/server';
import {
  requireApprovedDetectionSubmitter,
  requireAuthenticatedUserId,
  withGuardedValue
} from '@/lib/api-guards';
import { withOptionalExternalApiProxy } from '@/lib/external-api-proxy';
import {
  listDetectionJobsForUser,
  processDetectionJob,
  queueDetectionJob
} from '@/lib/location-detection/jobs';
import { requireImageFileWithUploadAction } from '@/lib/request-image';
import { recordUserAction } from '@/lib/user-action-log';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return withOptionalExternalApiProxy({
    request,
    path: '/location-from-image',
    runLocal: async () =>
      withGuardedValue(
        requireAuthenticatedUserId({ createIfMissing: true }),
        async (userId) => {
          await recordUserAction({
            request,
            userId,
            action: 'DETECTION_JOB_LIST'
          });

          const jobs = await listDetectionJobsForUser(userId);
          return NextResponse.json(jobs, { status: 200 });
        }
      )
  });
}

export async function POST(request: Request) {
  return withOptionalExternalApiProxy({
    request,
    path: '/location-from-image',
    runLocal: async () =>
      withGuardedValue(requireApprovedDetectionSubmitter(), async (actor) => {
        try {
          const imageFile = await requireImageFileWithUploadAction({
            request,
            userId: actor.id,
            action: 'DETECTION_JOB_SUBMIT'
          });
          if (!imageFile.ok) {
            return imageFile.response;
          }
          const { file } = imageFile;

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
      })
  });
}
