import { processDetectionJob } from './jobs';
import { parseDetectionQueueMessage } from './queue';

type SqsRecord = {
  messageId: string;
  body: string;
};

type SqsEvent = {
  Records?: SqsRecord[];
};

type SqsBatchResponse = {
  batchItemFailures: Array<{ itemIdentifier: string }>;
};

export async function handler(event: SqsEvent): Promise<SqsBatchResponse> {
  const failures: Array<{ itemIdentifier: string }> = [];
  const records = Array.isArray(event.Records) ? event.Records : [];

  for (const record of records) {
    try {
      const payload = parseDetectionQueueMessage(record.body);
      await processDetectionJob(payload);
    } catch (error) {
      console.error('Detection queue worker failed for message', {
        messageId: record.messageId,
        error
      });
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  return {
    batchItemFailures: failures
  };
}
