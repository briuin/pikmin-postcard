import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveAccountIdFromEmail } from '@/lib/account-id';
import { createAppJwt, hashPassword, verifyAppJwt, verifyPassword } from '@/lib/auth-server';
import { UserApprovalStatus, UserRole } from '@/lib/domain/enums';

test('deriveAccountIdFromEmail uses the text before @ and normalizes unsupported characters', () => {
  assert.equal(deriveAccountIdFromEmail('Fly.Pik+Test@Example.com'), 'fly.pik+test');
  assert.equal(deriveAccountIdFromEmail('  @@  '), 'user');
});

test('hashPassword and verifyPassword round-trip correctly', () => {
  const password = 'secret-pass-123';
  const hashed = hashPassword(password);

  assert.equal(typeof hashed.hash, 'string');
  assert.equal(typeof hashed.salt, 'string');
  assert.equal(verifyPassword(password, hashed.hash, hashed.salt), true);
  assert.equal(verifyPassword('wrong-pass', hashed.hash, hashed.salt), false);
});

test('createAppJwt and verifyAppJwt preserve account auth payloads', () => {
  const token = createAppJwt(
    {
      id: 'usr_test',
      email: 'pilot@example.com',
      displayName: 'Pilot',
      accountId: 'pilot',
      role: UserRole.MEMBER,
      approvalStatus: UserApprovalStatus.APPROVED,
      canUsePlantPaths: true,
      hasPremiumAccess: false
    },
    'test-secret'
  );

  const payload = verifyAppJwt(token, 'test-secret');
  assert.ok(payload);
  assert.equal(payload?.sub, 'usr_test');
  assert.equal(payload?.email, 'pilot@example.com');
  assert.equal(payload?.name, 'Pilot');
  assert.equal(payload?.accountId, 'pilot');
  assert.equal(payload?.canUsePlantPaths, true);
  assert.equal(payload?.hasPremiumAccess, false);
});
