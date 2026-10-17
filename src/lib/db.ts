import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const globalDb = globalThis as unknown as { aidirectDb?: PrismaClient };
// Remote integration tests cross the public network; deployed app and DB share iad1.
const testTimeout =
  process.env.NODE_ENV === 'test' &&
  process.env.TEST_DATABASE_URL &&
  new URL(process.env.DATABASE_URL!).pathname === '/aidirect_test'
    ? 60000
    : 15000;
export const db =
  globalDb.aidirectDb ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 20000,
      statement_timeout: 5000,
      query_timeout: testTimeout,
    }),
    transactionOptions: { maxWait: testTimeout, timeout: testTimeout },
  });
if (process.env.NODE_ENV !== 'production') globalDb.aidirectDb = db;
