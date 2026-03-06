import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { resolveDataStoreProvider } from '@/lib/repos/data-store-provider';

const originalAppDataStore = process.env.APP_DATA_STORE;
const originalDataStore = process.env.DATA_STORE;
const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (originalAppDataStore === undefined) {
    delete process.env.APP_DATA_STORE;
  } else {
    process.env.APP_DATA_STORE = originalAppDataStore;
  }

  if (originalDataStore === undefined) {
    delete process.env.DATA_STORE;
  } else {
    process.env.DATA_STORE = originalDataStore;
  }

  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

test('prefers APP_DATA_STORE value when set to dynamodb', () => {
  process.env.APP_DATA_STORE = 'dynamodb';
  process.env.DATA_STORE = 'prisma';
  process.env.DATABASE_URL = 'postgresql://local';
  assert.equal(resolveDataStoreProvider(), 'dynamodb');
});

test('uses prisma when explicit provider set', () => {
  process.env.APP_DATA_STORE = 'prisma';
  delete process.env.DATA_STORE;
  delete process.env.DATABASE_URL;
  assert.equal(resolveDataStoreProvider(), 'prisma');
});

test('falls back to dynamodb when DATABASE_URL is not configured', () => {
  delete process.env.APP_DATA_STORE;
  delete process.env.DATA_STORE;
  delete process.env.DATABASE_URL;
  assert.equal(resolveDataStoreProvider(), 'dynamodb');
});

test('falls back to prisma when DATABASE_URL exists and no explicit store', () => {
  delete process.env.APP_DATA_STORE;
  delete process.env.DATA_STORE;
  process.env.DATABASE_URL = 'postgresql://local';
  assert.equal(resolveDataStoreProvider(), 'prisma');
});
