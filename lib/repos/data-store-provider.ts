export type DataStoreProvider = 'prisma' | 'dynamodb';

export function resolveDataStoreProvider(): DataStoreProvider {
  const value = (process.env.APP_DATA_STORE ?? process.env.DATA_STORE ?? '').trim().toLowerCase();
  if (value === 'dynamodb' || value === 'ddb') {
    return 'dynamodb';
  }
  if (value === 'prisma') {
    return 'prisma';
  }
  if (!process.env.DATABASE_URL) {
    return 'dynamodb';
  }
  return 'prisma';
}
