import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextResponse } from 'next/server';
import { UserApprovalStatus, UserRole } from '@prisma/client';
import { createApiGuards, type GuardResult } from '@/lib/api-guards';

type TestActor = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  approvalStatus: UserApprovalStatus;
  canCreatePostcard: boolean;
  canSubmitDetection: boolean;
  canVote: boolean;
};

function createTestActor(
  overrides: Partial<TestActor> = {}
): TestActor {
  return {
    id: 'usr_test_member',
    email: 'member@example.com',
    name: 'Member',
    role: UserRole.MEMBER,
    approvalStatus: UserApprovalStatus.APPROVED,
    canCreatePostcard: true,
    canSubmitDetection: true,
    canVote: true,
    ...overrides
  };
}

function createApiGuardsForTest(params: {
  actor?: TestActor | null;
  userId?: string | null;
} = {}) {
  const actor = params.actor ?? null;
  const userId = params.userId ?? (actor?.id ?? null);

  return createApiGuards({
    async getAuthenticatedUser() {
      return actor;
    },
    async getAuthenticatedUserId() {
      return userId;
    },
    isApprovedUser(user) {
      return user.approvalStatus === UserApprovalStatus.APPROVED;
    },
    isAdminRole(role) {
      return role === UserRole.ADMIN;
    },
    isManagerOrAboveRole(role) {
      return role === UserRole.ADMIN || role === UserRole.MANAGER;
    }
  });
}

async function expectError<T>(
  guard: GuardResult<T>,
  status: number,
  message: string
) {
  assert.equal(guard.ok, false);
  if (guard.ok) {
    return;
  }

  assert.equal(guard.response.status, status);
  const payload = (await guard.response.json()) as { error?: string };
  assert.equal(payload.error, message);
}

test('requireApprovedCreator returns 401 when unauthenticated', async () => {
  const guards = createApiGuardsForTest({ actor: null, userId: null });
  const result = await guards.requireApprovedCreator();
  await expectError(result, 401, 'Unauthorized.');
});

test('requireApprovedCreator returns 403 when account is pending approval', async () => {
  const guards = createApiGuardsForTest({
    actor: createTestActor({
      id: 'usr_pending',
      approvalStatus: UserApprovalStatus.PENDING
    })
  });

  const result = await guards.requireApprovedCreator();
  await expectError(result, 403, 'Account pending approval.');
});

test('requireApprovedCreator returns 403 when create capability is disabled', async () => {
  const guards = createApiGuardsForTest({
    actor: createTestActor({
      id: 'usr_no_create',
      canCreatePostcard: false
    })
  });

  const result = await guards.requireApprovedCreator();
  await expectError(result, 403, 'You are not allowed to create postcards.');
});

test('requireApprovedVoter returns 403 when vote capability is disabled', async () => {
  const guards = createApiGuardsForTest({
    actor: createTestActor({
      id: 'usr_no_vote',
      canVote: false
    })
  });

  const result = await guards.requireApprovedVoter();
  await expectError(result, 403, 'You are not allowed to vote or report locations.');
});

test('requireApprovedDetectionSubmitter returns 403 when detection capability is disabled', async () => {
  const guards = createApiGuardsForTest({
    actor: createTestActor({
      id: 'usr_no_detection',
      canSubmitDetection: false
    })
  });

  const result = await guards.requireApprovedDetectionSubmitter();
  await expectError(result, 403, 'You are not allowed to submit AI detection jobs.');
});

test('requireManagerActor blocks MEMBER role', async () => {
  const guards = createApiGuardsForTest({
    actor: createTestActor({
      id: 'usr_member',
      role: UserRole.MEMBER
    })
  });

  const result = await guards.requireManagerActor();
  await expectError(result, 403, 'Forbidden.');
});

test('requireAdminActor allows ADMIN role', async () => {
  const actor = createTestActor({
    id: 'usr_admin',
    role: UserRole.ADMIN
  });
  const guards = createApiGuardsForTest({ actor });

  const result = await guards.requireAdminActor();
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.value.id, actor.id);
});

test('withGuardedValue runs callback only when guard passes', async () => {
  const actor = createTestActor({
    id: 'usr_allowed',
    role: UserRole.MANAGER
  });
  const guards = createApiGuardsForTest({ actor });

  const allowedResponse = await guards.withGuardedValue(
    guards.requireManagerActor(),
    async (value) => NextResponse.json({ actorId: value.id }, { status: 200 })
  );
  assert.equal(allowedResponse.status, 200);
  const allowedPayload = (await allowedResponse.json()) as { actorId: string };
  assert.equal(allowedPayload.actorId, actor.id);

  const deniedResponse = await guards.withGuardedValue(
    createApiGuardsForTest({
      actor: createTestActor({ role: UserRole.MEMBER })
    }).requireManagerActor(),
    async () => NextResponse.json({ ok: true }, { status: 200 })
  );
  assert.equal(deniedResponse.status, 403);
});
