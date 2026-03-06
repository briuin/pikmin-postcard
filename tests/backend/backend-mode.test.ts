import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseAppBackendMode,
  resolveAppBackendMode,
  resolveServerlessApiBaseUrl,
  shouldProxyToServerless
} from '@/lib/backend/backend-mode';

test('resolveServerlessApiBaseUrl trims and strips trailing slash', () => {
  assert.equal(
    resolveServerlessApiBaseUrl({
      SERVERLESS_API_BASE_URL: ' https://example.execute-api.us-east-1.amazonaws.com/ '
    }),
    'https://example.execute-api.us-east-1.amazonaws.com'
  );
});

test('parseAppBackendMode supports aliases', () => {
  assert.equal(parseAppBackendMode('local'), 'local');
  assert.equal(parseAppBackendMode('internal'), 'local');
  assert.equal(parseAppBackendMode('proxy'), 'proxy');
  assert.equal(parseAppBackendMode('external'), 'proxy');
  assert.equal(parseAppBackendMode('serverless'), 'proxy');
  assert.equal(parseAppBackendMode('unknown'), null);
});

test('resolveAppBackendMode defaults to local without server base', () => {
  assert.equal(resolveAppBackendMode({ APP_BACKEND_MODE: '', SERVERLESS_API_BASE_URL: '' }), 'local');
});

test('resolveAppBackendMode defaults to proxy when server base exists', () => {
  assert.equal(
    resolveAppBackendMode({
      APP_BACKEND_MODE: '',
      SERVERLESS_API_BASE_URL: 'https://example.execute-api.us-east-1.amazonaws.com'
    }),
    'proxy'
  );
});

test('explicit local mode disables proxy even when server base exists', () => {
  assert.equal(
    shouldProxyToServerless({
      APP_BACKEND_MODE: 'local',
      SERVERLESS_API_BASE_URL: 'https://example.execute-api.us-east-1.amazonaws.com'
    }),
    false
  );
});

test('proxy mode requires server base URL to proxy', () => {
  assert.equal(
    shouldProxyToServerless({
      APP_BACKEND_MODE: 'proxy',
      SERVERLESS_API_BASE_URL: ''
    }),
    false
  );
  assert.equal(
    shouldProxyToServerless({
      APP_BACKEND_MODE: 'proxy',
      SERVERLESS_API_BASE_URL: 'https://example.execute-api.us-east-1.amazonaws.com'
    }),
    true
  );
});
