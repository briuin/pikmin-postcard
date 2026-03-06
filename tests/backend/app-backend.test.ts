import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  externalAppBackend,
  getAppBackend,
  localAppBackend
} from '@/lib/backend/app-backend';

const originalUseExternal = process.env.NEXT_PUBLIC_USE_EXTERNAL_SERVERLESS_API;
const originalPublicBase = process.env.NEXT_PUBLIC_SERVERLESS_API_BASE_URL;
const originalServerBase = process.env.SERVERLESS_API_BASE_URL;

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
});

test('selects local backend when no serverless base URL is set', () => {
  setBackendEnv({ mode: undefined, publicBase: undefined, serverBase: undefined });
  assert.equal(getAppBackend(), localAppBackend);
});

test('selects local backend when mode explicitly disables external backend', () => {
  setBackendEnv({
    mode: 'false',
    publicBase: 'https://example.execute-api.us-east-1.amazonaws.com'
  });
  assert.equal(getAppBackend(), localAppBackend);
});

test('selects external backend when base URL is set and mode is not false', () => {
  setBackendEnv({
    mode: 'true',
    publicBase: 'https://example.execute-api.us-east-1.amazonaws.com'
  });
  assert.equal(getAppBackend(), externalAppBackend);
});
