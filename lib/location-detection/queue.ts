import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { ProcessDetectionJobParams } from '@/lib/location-detection/jobs';

type DetectionQueueEnvelope = {
  version: 1;
  payload: ProcessDetectionJobParams;
};

let sqsClient: SQSClient | null = null;

function getQueueUrl(): string {
  return String(process.env.DETECTION_QUEUE_URL || '').trim();
}

function getSqsClient(): SQSClient {
  if (sqsClient) {
    return sqsClient;
  }
  sqsClient = new SQSClient({
    region: process.env.AWS_REGION || process.env.S3_REGION || 'us-east-1'
  });
  return sqsClient;
}

export async function enqueueDetectionJobMessage(payload: ProcessDetectionJobParams): Promise<boolean> {
  const queueUrl = getQueueUrl();
  if (!queueUrl) {
    return false;
  }

  const envelope: DetectionQueueEnvelope = {
    version: 1,
    payload
  };

  await getSqsClient().send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(envelope)
    })
  );

  return true;
}

export function parseDetectionQueueMessage(messageBody: string): ProcessDetectionJobParams {
  const parsed = JSON.parse(messageBody) as Partial<DetectionQueueEnvelope>;
  const payload = parsed?.payload;

  if (parsed?.version !== 1 || !payload || typeof payload !== 'object') {
    throw new Error('Invalid detection queue message envelope.');
  }

  const requiredFields: Array<keyof ProcessDetectionJobParams> = [
    'jobId',
    'userId',
    'mimeType',
    'originalImageUrl',
    'originalObjectKey',
    'postcardObjectKey'
  ];
  for (const field of requiredFields) {
    const value = payload[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Invalid detection queue message field: ${field}`);
    }
  }

  return {
    jobId: payload.jobId.trim(),
    userId: payload.userId.trim(),
    mimeType: payload.mimeType.trim(),
    originalImageUrl: payload.originalImageUrl.trim(),
    originalObjectKey: payload.originalObjectKey.trim(),
    postcardObjectKey: payload.postcardObjectKey.trim()
  };
}
