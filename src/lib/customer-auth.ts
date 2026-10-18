import { betterAuth } from 'better-auth/minimal';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError } from 'better-auth/api';
import { createHmac } from 'node:crypto';
import { db } from './db';
import { baseUrl, required } from './config';
import { hashPassword, verifyPassword } from './password';

export async function consumeAuthLimit(key: string, window: number, max: number) {
  const digest = createHmac('sha256', required('SESSION_SECRET'))
    .update('auth-limit:' + key)
    .digest('hex');
  const now = new Date(),
    until = new Date(now.getTime() + window * 1000);
  const rows = await db.$queryRaw<{ count: number; expiresAt: Date }[]>`
    INSERT INTO "AuthThrottle" (key,count,"expiresAt") VALUES (${digest},1,${until})
    ON CONFLICT (key) DO UPDATE SET count=CASE WHEN "AuthThrottle"."expiresAt"<=${now} THEN 1 ELSE LEAST("AuthThrottle".count+1,${max + 1}) END,
    "expiresAt"=CASE WHEN "AuthThrottle"."expiresAt"<=${now} THEN ${until} ELSE "AuthThrottle"."expiresAt" END
    RETURNING count,"expiresAt"`;
  return {
    allowed: rows[0].count <= max,
    retryAfter:
      rows[0].count > max
        ? Math.max(1, Math.ceil((rows[0].expiresAt.getTime() - Date.now()) / 1000))
        : null,
  };
}
// Lazy initialization keeps build-time rendering independent of private runtime config.
let instance: ReturnType<typeof createCustomerAuth> | undefined;
function createCustomerAuth() {
  return betterAuth({
    appName: 'AiDirect',
    baseURL: baseUrl(),
    basePath: '/api/auth',
    secret: createHmac('sha256', required('SESSION_SECRET'))
      .update('customer-auth-v1')
      .digest('hex'),
    database: prismaAdapter(db, { provider: 'postgresql', transaction: true }),
    trustedOrigins: [baseUrl()],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: true,
      password: {
        hash: hashPassword,
        verify: ({ password, hash }) => verifyPassword(password, hash),
      },
    },
    user: {
      additionalFields: {
        platformRole: { type: 'string', defaultValue: 'CUSTOMER', input: false },
        suspended: { type: 'boolean', defaultValue: false, input: false },
      },
    },
    session: { expiresIn: 8 * 3600, updateAge: 3600, cookieCache: { enabled: false } },
    advanced: {
      cookiePrefix: 'aidirect_customer',
      useSecureCookies: baseUrl().startsWith('https:'),
      ipAddress: { ipAddressHeaders: process.env.VERCEL ? ['x-forwarded-for'] : [] },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 60,
      customRules: {
        '/sign-up/email': { window: 600, max: 10 },
        '/sign-in/email': { window: 60, max: 10 },
      },
      customStorage: { consume: (key, rule) => consumeAuthLimit(key, rule.window, rule.max) },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (
              process.env.SIGNUP_ENABLED !== 'true' ||
              user.email.trim().toLowerCase() === process.env.OPERATOR_EMAIL?.trim().toLowerCase()
            )
              throw new APIError('BAD_REQUEST', {
                message: 'Registration unavailable for these details',
              });
            if (user.name.trim().length < 2 || user.name.length > 80)
              throw new APIError('BAD_REQUEST', { message: 'Invalid name' });
            return {
              data: {
                ...user,
                name: user.name.trim(),
                email: user.email.trim().toLowerCase(),
                platformRole: 'CUSTOMER',
                suspended: false,
              },
            };
          },
        },
      },
      session: {
        create: {
          before: async (session, context) => {
            const user = await context?.context.internalAdapter.findUserById(session.userId);
            if (!user || ('suspended' in user && user.suspended))
              throw new APIError('UNAUTHORIZED', { message: 'Sign in unavailable' });
            return { data: { ...session, ipAddress: '', userAgent: '' } };
          },
        },
      },
    },
    logger: { disabled: true },
  });
}
export function customerAuth() {
  return (instance ??= createCustomerAuth());
}
export async function customerIdentity(headers: Headers) {
  const session = await customerAuth().api.getSession({ headers });
  if (!session) throw new Error('unauthorized');
  // Re-read role/status on every privileged request; no cached privilege claims.
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      platformRole: true,
      suspended: true,
    },
  });
  if (!user || user.suspended || !user.email) throw new Error('unauthorized');
  return user;
}
export async function ensureCustomerWorkspace(userId: string, name: string) {
  return db.$transaction(async (tx) => {
    const users = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
    if (!users.length) throw new Error('unauthorized');
    const existing = await tx.workspace.findUnique({ where: { ownerId: userId } });
    if (existing) return existing;
    return tx.workspace.create({
      data: {
        name: `فروشگاه ${name}`.slice(0, 100),
        ownerId: userId,
        memberships: { create: { userId, role: 'OWNER' } },
      },
    });
  });
}
