import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  externalAdminBackend,
  externalDetectionBackend,
  externalPostcardsBackend
} from '@/lib/backend/external-backends';

const originalUseExternal = process.env.NEXT_PUBLIC_USE_EXTERNAL_SERVERLESS_API;
const originalPublicBase = process.env.NEXT_PUBLIC_SERVERLESS_API_BASE_URL;
const originalServerBase = process.env.SERVERLESS_API_BASE_URL;
const originalFetch = globalThis.fetch;

function setBackendEnv(params: {
  mode?: string | undefined;
  publicBase?: string | undefined;
  serverBase?: string | undefined;
}) {
  if (params.mode === undefined) {
    delete process.env.NEXT_PUBLIC_USE_EXTERNAL_SERVERLESS_API;
  } else {
    process.env.NEXT_PUBLIC_USE_EXTERNAL_SERVERLESS_API = params.mode;
  }

  if (params.publicBase === undefined) {
    delete process.env.NEXT_PUBLIC_SERVERLESS_API_BASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SERVERLESS_API_BASE_URL = params.publicBase;
  }

  if (params.serverBase === undefined) {
    delete process.env.SERVERLESS_API_BASE_URL;
  } else {
    process.env.SERVERLESS_API_BASE_URL = params.serverBase;
  }
}

afterEach(() => {
  if (originalUseExternal === undefined) {
    delete process.env.NEXT_PUBLIC_USE_EXTERNAL_SERVERLESS_API;
  } else {
    process.env.NEXT_PUBLIC_USE_EXTERNAL_SERVERLESS_API = originalUseExternal;
  }

  if (originalPublicBase === undefined) {
    delete process.env.NEXT_PUBLIC_SERVERLESS_API_BASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SERVERLESS_API_BASE_URL = originalPublicBase;
  }

  if (originalServerBase === undefined) {
    delete process.env.SERVERLESS_API_BASE_URL;
  } else {
    process.env.SERVERLESS_API_BASE_URL = originalServerBase;
  }

  globalThis.fetch = originalFetch;
});

test('external postcards list forwards query and headers to serverless API', async () => {
  setBackendEnv({
    mode: 'true',
    publicBase: 'https://example.execute-api.us-east-1.amazonaws.com/'
  });

  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const response = await externalPostcardsBackend.list(
    new Request('http://localhost:3000/api/postcards?limit=10&sort=ranking', {
      headers: { authorization: 'Bearer token' }
    })
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://example.execute-api.us-east-1.amazonaws.com/postcards?limit=10&sort=ranking'
  );
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(
    new Headers(calls[0].init.headers).get('authorization'),
    'Bearer token'
  );
});

test('external detection create forwards POST body to serverless API', async () => {
  setBackendEnv({
    mode: 'true',
    publicBase: 'https://example.execute-api.us-east-1.amazonaws.com'
  });

  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify({ id: 'job-1' }), {
      status: 202,
      headers: { 'content-type': 'application/json' }
    });
  };

  const response = await externalDetectionBackend.create(
    new Request('http://localhost:3000/api/location-from-image', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ foo: 'bar' })
    })
  );

  assert.equal(response.status, 202);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://example.execute-api.us-east-1.amazonaws.com/location-from-image'
  );
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(new Headers(calls[0].init.headers).get('content-type'), 'application/json');

  const requestBody = calls[0].init.body;
  assert.ok(requestBody instanceof ArrayBuffer);
  assert.equal(new TextDecoder().decode(new Uint8Array(requestBody)), '{"foo":"bar"}');
});

test('external admin list users returns 500 when serverless base URL is missing', async () => {
  setBackendEnv({
    mode: 'true',
    publicBase: undefined,
    serverBase: undefined
  });

  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error('fetch should not be called');
  };

  const response = await externalAdminBackend.listUsers(
    new Request('http://localhost:3000/api/admin/users?q=abc')
  );
  const payload = (await response.json()) as { error?: string };

  assert.equal(response.status, 500);
  assert.equal(called, false);
  assert.equal(payload.error, 'External serverless backend is not configured.');
});
