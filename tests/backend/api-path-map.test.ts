import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isProxyableInternalApiPath,
  mapInternalApiPathToServerless
} from '@/lib/backend/api-path-map';

test('maps proxyable internal API paths to serverless routes', () => {
  assert.equal(mapInternalApiPathToServerless('/api/postcards'), '/postcards');
  assert.equal(
    mapInternalApiPathToServerless('/api/postcards/pc_123/feedback'),
    '/postcards/pc_123/feedback'
  );
  assert.equal(
    mapInternalApiPathToServerless('/api/admin/reports/case_1?status=pending'),
    '/admin/reports/case_1?status=pending'
  );
  assert.equal(mapInternalApiPathToServerless('/api/auth/session'), '/auth/session');
});

test('preserves query for absolute URLs when mapping', () => {
  const mapped = mapInternalApiPathToServerless(
    'https://pikmin.askans.app/api/postcards?sort=ranking&limit=20'
  );
  assert.equal(mapped, '/postcards?sort=ranking&limit=20');
});

test('returns null for non-proxyable paths', () => {
  assert.equal(mapInternalApiPathToServerless('/api/auth/google-client-id'), null);
  assert.equal(mapInternalApiPathToServerless('/api/unknown'), null);
  assert.equal(mapInternalApiPathToServerless('/postcards'), null);
});

test('matches proxyable path checks', () => {
  assert.equal(isProxyableInternalApiPath('/api/postcards/pc_1'), true);
  assert.equal(isProxyableInternalApiPath('/api/admin/users'), true);
  assert.equal(isProxyableInternalApiPath('/api/auth/google-client-id'), false);
  assert.equal(isProxyableInternalApiPath('/api/auth/[...nextauth]'), false);
});
