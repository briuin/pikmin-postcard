import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { ddbDoc, ddbTables } from '@/lib/repos/dynamodb/shared';
import {
  DEFAULT_AVAILABLE_ROOT_INVITE_CODES,
  generateAdminInviteCodes,
  getAdminInvitationState,
  getProfileInvitationState,
  redeemInviteCode
} from '@/lib/invitations/service';
import { PremiumFeatureKey } from '@/lib/premium-features';
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

test('admin invite generation creates unique 9-letter codes', async () => {
  setFakeClient({
    [ddbTables.users]: [{ id: 'usr_admin', email: 'admin@example.com', displayName: 'Admin' }]
  });

  const codes = await generateAdminInviteCodes({
    count: 3,
    actorId: 'usr_admin'
  });

  assert.equal(codes.length, 3);
  assert.equal(new Set(codes.map((item) => item.code)).size, 3);
  for (const code of codes) {
    assert.match(code.code, /^[A-Z]{9}$/);
    assert.equal(code.ownerUserId, null);
    assert.equal(code.isUsed, false);
  }
});

test('admin invitation state auto-fills the default root code pool to 100 codes', async () => {
  const fake = setFakeClient({
    [ddbTables.users]: [{ id: 'usr_admin', email: 'admin@example.com', displayName: 'Admin' }]
  });

  const result = await getAdminInvitationState();

  assert.equal(fake.getTableRows(ddbTables.inviteCodes).length, DEFAULT_AVAILABLE_ROOT_INVITE_CODES);
  assert.equal(result.inviteCodes.length, 10);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 10);
  assert.equal(result.totalCount, DEFAULT_AVAILABLE_ROOT_INVITE_CODES);
  assert.equal(result.totalPages, 10);
  const availableRootCodes = fake
    .getTableRows(ddbTables.inviteCodes)
    .filter((row) => !row.ownerUserId && !row.usedByUserId);
  assert.equal(availableRootCodes.length, DEFAULT_AVAILABLE_ROOT_INVITE_CODES);
});

test('redeeming an invite code unlocks premium and creates two child codes', async () => {
  const fake = setFakeClient({
    [ddbTables.users]: [
      {
        id: 'usr_owner',
        email: 'owner@example.com',
        displayName: 'Owner',
        accountId: 'owner',
        hasPremiumAccess: true,
        redeemedInviteCode: 'ROOTCODEA'
      },
      {
        id: 'usr_new',
        email: 'new@example.com',
        displayName: 'New User',
        accountId: 'new-user',
        hasPremiumAccess: false
      }
    ],
    [ddbTables.inviteCodes]: [
      {
        id: 'ABCDEFGHJ',
        ownerUserId: 'usr_owner',
        createdAt: '2026-03-13T09:00:00.000Z',
        updatedAt: '2026-03-13T09:00:00.000Z'
      }
    ]
  });

  const result = await redeemInviteCode({
    userId: 'usr_new',
    code: 'abcdefghj'
  });

  assert.equal(result.hasPremiumAccess, true);
  assert.equal(result.redeemedInviteCode, 'ABCDEFGHJ');
  assert.equal(result.premiumFeatureIds.includes(PremiumFeatureKey.PLANT_PATHS), true);
  assert.equal(result.inviteCodes.length, 2);
  for (const invite of result.inviteCodes) {
    assert.match(invite.code, /^[A-Z]{9}$/);
    assert.equal(invite.ownerUserId, 'usr_new');
    assert.equal(invite.isUsed, false);
  }

  const redeemedRow = fake.getById(ddbTables.inviteCodes, 'ABCDEFGHJ');
  assert.equal(redeemedRow?.usedByUserId, 'usr_new');

  const updatedUser = fake.getById(ddbTables.users, 'usr_new');
  assert.equal(updatedUser?.hasPremiumAccess, true);
  assert.equal(updatedUser?.redeemedInviteCode, 'ABCDEFGHJ');

  const availableRootCodes = fake
    .getTableRows(ddbTables.inviteCodes)
    .filter((row) => !row.ownerUserId && !row.usedByUserId);
  assert.equal(availableRootCodes.length, DEFAULT_AVAILABLE_ROOT_INVITE_CODES);
});

test('profile invitation state lists owned invite codes', async () => {
  setFakeClient({
    [ddbTables.users]: [
      {
        id: 'usr_owner',
        email: 'owner@example.com',
        displayName: 'Owner',
        accountId: 'owner',
        hasPremiumAccess: true,
        redeemedInviteCode: 'ROOTCODEA'
      },
      {
        id: 'usr_friend',
        email: 'friend@example.com',
        displayName: 'Friend',
        accountId: 'friend'
      }
    ],
    [ddbTables.inviteCodes]: [
      {
        id: 'SHARECODE',
        ownerUserId: 'usr_owner',
        usedByUserId: 'usr_friend',
        usedAt: '2026-03-13T10:00:00.000Z',
        createdAt: '2026-03-13T09:00:00.000Z'
      }
    ]
  });

  const result = await getProfileInvitationState('usr_owner');
  assert.equal(result.hasPremiumAccess, true);
  assert.equal(result.inviteCodes.length, 1);
  assert.equal(result.inviteCodes[0]?.usedByAccountId, 'friend');
  assert.equal(result.inviteCodes[0]?.isUsed, true);
});
