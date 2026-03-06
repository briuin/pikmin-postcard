import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAppBackend, localAppBackend } from '@/lib/backend/app-backend';

test('app backend always resolves to local backend handlers', () => {
  assert.equal(getAppBackend(), localAppBackend);
});
