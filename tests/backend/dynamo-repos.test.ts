import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { buildGeoBucketFromCoordinates } from '@/lib/postcards/geo';
import { FeedbackAction, PostcardReportStatus } from '@/lib/domain/enums';
import { ddbDoc, ddbTables } from '@/lib/repos/dynamodb/shared';
import { dynamoPostcardRepo } from '@/lib/repos/postcards/dynamo-postcard-repo';
import { dynamoReportRepo } from '@/lib/repos/reports/dynamo-report-repo';
import { FakeDynamoDocClient } from '@/tests/helpers/fake-dynamodb-doc';

const originalSend = ddbDoc.send.bind(ddbDoc);

afterEach(() => {
  (ddbDoc as { send: typeof ddbDoc.send }).send = originalSend;
});

function setFakeClient(seed: Record<string, Array<Record<string, unknown>>>) {
  const fake = new FakeDynamoDocClient(seed);
  (ddbDoc as { send: typeof ddbDoc.send }).send = fake.send.bind(fake) as typeof ddbDoc.send;
  return fake;
}

test('dynamo postcard repo supports list/count/saved/viewer-feedback flows', async () => {
  setFakeClient({
    [ddbTables.users]: [
      { id: 'usr_1', email: 'alice@example.com', displayName: 'Alice' },
      { id: 'usr_2', email: 'bob@example.com', displayName: 'Bob' }
    ],
    [ddbTables.postcards]: [
      {
        id: 'pc_1',
        userId: 'usr_1',
        title: 'First',
        postcardType: 'MUSHROOM',
        latitude: 1.31,
        longitude: 103.86,
        likeCount: 1,
        dislikeCount: 0,
        wrongLocationReports: 0,
        reportVersion: 1,
        locationStatus: 'AUTO',
        geoBucket: buildGeoBucketFromCoordinates(1.31, 103.86),
        deletedAt: null,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z'
      },
      {
        id: 'pc_2',
        userId: 'usr_1',
        title: 'Second',
        postcardType: 'FLOWER',
        latitude: 35.68,
        longitude: 139.76,
        likeCount: 0,
        dislikeCount: 2,
        wrongLocationReports: 1,
        reportVersion: 1,
        locationStatus: 'AUTO',
        geoBucket: buildGeoBucketFromCoordinates(35.68, 139.76),
        deletedAt: null,
        createdAt: '2026-03-02T10:00:00.000Z',
        updatedAt: '2026-03-02T10:00:00.000Z'
      },
      {
        id: 'pc_3',
        userId: 'usr_2',
        title: 'Third',
        postcardType: 'UNKNOWN',
        latitude: 48.85,
        longitude: 2.29,
        likeCount: 0,
        dislikeCount: 0,
        wrongLocationReports: 0,
        reportVersion: 1,
        locationStatus: 'AUTO',
        geoBucket: buildGeoBucketFromCoordinates(48.85, 2.29),
        deletedAt: null,
        createdAt: '2026-03-03T10:00:00.000Z',
        updatedAt: '2026-03-03T10:00:00.000Z'
      }
    ],
    [ddbTables.postcardFeedback]: [
      {
        id: 'fb_1',
        postcardId: 'pc_3',
        userId: 'usr_1',
        action: 'FAVORITE',
        createdAt: '2026-03-05T10:00:00.000Z',
        uniqueKey: 'pc_3#usr_1#FAVORITE'
      },
      {
        id: 'fb_2',
        postcardId: 'pc_1',
        userId: 'usr_1',
        action: 'COLLECTED',
        createdAt: '2026-03-04T10:00:00.000Z',
        uniqueKey: 'pc_1#usr_1#COLLECTED'
      },
      {
        id: 'fb_3',
        postcardId: 'pc_1',
        userId: 'usr_1',
        action: 'LIKE',
        createdAt: '2026-03-04T12:00:00.000Z',
        uniqueKey: 'pc_1#usr_1#LIKE'
      },
      {
        id: 'fb_4',
        postcardId: 'pc_2',
        userId: 'usr_1',
        action: 'DISLIKE',
        createdAt: '2026-03-04T13:00:00.000Z',
        uniqueKey: 'pc_2#usr_1#DISLIKE'
      }
    ],
    [ddbTables.postcardReports]: [
      {
        id: 'r_1',
        postcardId: 'pc_2',
        version: 1,
        caseId: 'rc_1',
        reporterUserId: 'usr_1',
        reason: 'WRONG_LOCATION',
        description: null,
        uniqueKey: 'pc_2#1#usr_1',
        createdAt: '2026-03-04T14:00:00.000Z',
        updatedAt: '2026-03-04T14:00:00.000Z'
      }
    ]
  });

  const mine = await dynamoPostcardRepo.findForList({
    where: {
      userId: 'usr_1',
      deletedAt: null
    },
    orderBy: { createdAt: 'desc' },
    take: 2
  });
  assert.deepEqual(mine.map((item) => item.id), ['pc_2', 'pc_1']);
  assert.equal(mine[0].user.displayName, 'Alice');

  const mineCount = await dynamoPostcardRepo.count({
    AND: [{ userId: 'usr_1' }, { deletedAt: null }]
  });
  assert.equal(mineCount, 2);

  const boundedCount = await dynamoPostcardRepo.count({
    AND: [
      { deletedAt: null },
      {
        latitude: { not: null, gte: 1.2, lte: 1.4 },
        longitude: { not: null, gte: 103.7, lte: 104.0 }
      }
    ]
  });
  assert.equal(boundedCount, 1);

  const savedIds = await dynamoPostcardRepo.findSavedPostcardIdsByUser({
    userId: 'usr_1',
    take: 10
  });
  assert.deepEqual(savedIds, ['pc_3', 'pc_1']);

  const feedbackRows = await dynamoPostcardRepo.findViewerFeedbackRowsForPostcards({
    userId: 'usr_1',
    postcardIds: ['pc_1', 'pc_2', 'pc_3']
  });
  const byAction = new Set(feedbackRows.map((row) => `${row.postcardId}:${row.action}`));
  assert.equal(byAction.has(`pc_1:${FeedbackAction.LIKE}`), true);
  assert.equal(byAction.has(`pc_1:${FeedbackAction.COLLECTED}`), true);
  assert.equal(byAction.has(`pc_2:${FeedbackAction.DISLIKE}`), true);
  assert.equal(byAction.has(`pc_2:${FeedbackAction.REPORT_WRONG_LOCATION}`), true);
  assert.equal(byAction.has(`pc_3:${FeedbackAction.FAVORITE}`), true);
});

test('dynamo postcard repo findForPublicQuery uses geo bounds and keyword fallback', async () => {
  setFakeClient({
    [ddbTables.users]: [{ id: 'usr_1', email: 'alice@example.com', displayName: 'Alice' }],
    [ddbTables.postcards]: [
      {
        id: 'pc_sg',
        userId: 'usr_1',
        title: 'Marina Bay',
        postcardType: 'MUSHROOM',
        city: 'Singapore',
        country: 'Singapore',
        latitude: 1.2834,
        longitude: 103.8607,
        likeCount: 3,
        dislikeCount: 0,
        wrongLocationReports: 0,
        reportVersion: 1,
        locationStatus: 'AUTO',
        geoBucket: buildGeoBucketFromCoordinates(1.2834, 103.8607),
        deletedAt: null,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z'
      },
      {
        id: 'pc_jp',
        userId: 'usr_1',
        title: 'Tokyo Tower',
        postcardType: 'FLOWER',
        city: 'Tokyo',
        country: 'Japan',
        latitude: 35.6586,
        longitude: 139.7454,
        likeCount: 1,
        dislikeCount: 0,
        wrongLocationReports: 0,
        reportVersion: 1,
        locationStatus: 'AUTO',
        geoBucket: buildGeoBucketFromCoordinates(35.6586, 139.7454),
        deletedAt: null,
        createdAt: '2026-03-02T10:00:00.000Z',
        updatedAt: '2026-03-02T10:00:00.000Z'
      }
    ]
  });

  const bounded = await dynamoPostcardRepo.findForPublicQuery({
    sort: 'ranking',
    limit: 10,
    bounds: {
      north: 1.4,
      south: 1.2,
      east: 104,
      west: 103.7
    }
  });
  assert.equal(bounded.total, 1);
  assert.deepEqual(bounded.rows.map((item) => item.id), ['pc_sg']);

  const keywordOnly = await dynamoPostcardRepo.findForPublicQuery({
    q: 'tokyo',
    sort: 'newest',
    limit: 10,
    bounds: {
      north: 36,
      south: 35.4,
      east: 140.2,
      west: 139.4
    }
  });
  assert.equal(keywordOnly.total, 1);
  assert.deepEqual(keywordOnly.rows.map((item) => item.id), ['pc_jp']);
});

test('dynamo postcard repo submitFeedback handles vote toggle and report lifecycle', async () => {
  const fake = setFakeClient({
    [ddbTables.postcards]: [
      {
        id: 'pc_feedback',
        userId: 'usr_owner',
        title: 'Feedback card',
        postcardType: 'UNKNOWN',
        likeCount: 0,
        dislikeCount: 0,
        wrongLocationReports: 0,
        reportVersion: 1,
        locationStatus: 'AUTO',
        deletedAt: null,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z'
      }
    ]
  });

  const likeAdded = await dynamoPostcardRepo.submitFeedback({
    postcardId: 'pc_feedback',
    userId: 'usr_actor',
    action: 'like'
  });
  assert.equal(likeAdded?.result, 'added');
  assert.equal(likeAdded?.likeCount, 1);

  const likeRemoved = await dynamoPostcardRepo.submitFeedback({
    postcardId: 'pc_feedback',
    userId: 'usr_actor',
    action: 'like'
  });
  assert.equal(likeRemoved?.result, 'removed');
  assert.equal(likeRemoved?.likeCount, 0);

  const reportAdded = await dynamoPostcardRepo.submitFeedback({
    postcardId: 'pc_feedback',
    userId: 'usr_actor',
    action: 'report',
    reportReason: 'SPAM',
    reportDescription: 'wrong place'
  });
  assert.equal(reportAdded?.result, 'added');
  assert.equal(reportAdded?.wrongLocationReports, 1);
  assert.equal(reportAdded?.viewerFeedback.reportedWrongLocation, true);

  const reportDuplicate = await dynamoPostcardRepo.submitFeedback({
    postcardId: 'pc_feedback',
    userId: 'usr_actor',
    action: 'report',
    reportReason: 'SPAM',
    reportDescription: 'duplicate'
  });
  assert.equal(reportDuplicate?.result, 'already_reported');
  assert.equal(reportDuplicate?.wrongLocationReports, 1);

  const reportCases = fake.getTableRows(ddbTables.postcardReportCases);
  const reports = fake.getTableRows(ddbTables.postcardReports);
  assert.equal(reportCases.length, 1);
  assert.equal(reports.length, 1);
});

test('dynamo report repo supports dashboard/admin/report-status flows', async () => {
  setFakeClient({
    [ddbTables.users]: [
      { id: 'usr_uploader', email: 'uploader@example.com', displayName: 'Uploader' },
      { id: 'usr_reporter_1', email: 'r1@example.com', displayName: 'Reporter One' },
      { id: 'usr_reporter_2', email: 'r2@example.com', displayName: 'Reporter Two' }
    ],
    [ddbTables.postcards]: [
      {
        id: 'pc_report',
        userId: 'usr_uploader',
        title: 'Mount Card',
        imageUrl: 'https://example.com/mount.jpg',
        placeName: 'Mount Place',
        wrongLocationReports: 2,
        reportVersion: 1,
        postcardType: 'UNKNOWN',
        locationStatus: 'AUTO',
        deletedAt: null,
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-03-01T10:00:00.000Z'
      }
    ],
    [ddbTables.postcardReportCases]: [
      {
        id: 'case_1',
        postcardId: 'pc_report',
        version: 1,
        status: 'PENDING',
        adminNote: null,
        resolvedAt: null,
        resolvedByUserId: null,
        createdAt: '2026-03-01T11:00:00.000Z',
        updatedAt: '2026-03-01T11:00:00.000Z'
      }
    ],
    [ddbTables.postcardReports]: [
      {
        id: 'report_1',
        postcardId: 'pc_report',
        version: 1,
        caseId: 'case_1',
        reporterUserId: 'usr_reporter_1',
        reason: 'WRONG_LOCATION',
        description: 'off by a lot',
        uniqueKey: 'pc_report#1#usr_reporter_1',
        createdAt: '2026-03-01T12:00:00.000Z',
        updatedAt: '2026-03-01T12:00:00.000Z'
      },
      {
        id: 'report_2',
        postcardId: 'pc_report',
        version: 1,
        caseId: 'case_1',
        reporterUserId: 'usr_reporter_2',
        reason: 'SPAM',
        description: 'spam content',
        uniqueKey: 'pc_report#1#usr_reporter_2',
        createdAt: '2026-03-01T13:00:00.000Z',
        updatedAt: '2026-03-01T13:00:00.000Z'
      }
    ]
  });

  const dashboardRows = await dynamoReportRepo.listDashboardReportsByReporter('usr_reporter_1');
  assert.equal(dashboardRows.length, 1);
  assert.equal(dashboardRows[0].caseId, 'case_1');

  const activeMap = await dynamoReportRepo.findActiveReportCaseDetailMapForPostcards(['pc_report']);
  assert.equal(activeMap.size, 1);
  assert.equal(activeMap.get('pc_report')?.reportCount, 2);

  const adminCases = await dynamoReportRepo.listAdminReportCases({
    status: PostcardReportStatus.PENDING,
    search: 'mount',
    limit: 10
  });
  assert.equal(adminCases.length, 1);
  assert.equal(adminCases[0].caseId, 'case_1');

  const editableStatusBefore = await dynamoReportRepo.findAdminEditableReportCaseStateByPostcardId(
    'pc_report'
  );
  assert.equal(editableStatusBefore, PostcardReportStatus.PENDING);

  const updated = await dynamoReportRepo.updateReportCaseStatus({
    caseId: 'case_1',
    nextStatus: PostcardReportStatus.VERIFIED,
    resolverUserId: 'usr_uploader',
    adminNote: 'checked'
  });
  assert.equal(updated?.status, PostcardReportStatus.VERIFIED);
  assert.equal(updated?.wrongLocationReports, 0);
  assert.equal(updated?.reportVersion, 2);

  const editableStatusAfter = await dynamoReportRepo.findAdminEditableReportCaseStateByPostcardId(
    'pc_report'
  );
  assert.equal(editableStatusAfter, null);

  const cancelResult = await dynamoReportRepo.cancelDashboardReport({
    userId: 'usr_reporter_1',
    reportId: 'report_1'
  });
  assert.deepEqual(cancelResult, { kind: 'resolved' });

  const caseDetail = await dynamoReportRepo.findAdminReportCaseById('case_1');
  assert.equal(caseDetail?.status, PostcardReportStatus.VERIFIED);
});
