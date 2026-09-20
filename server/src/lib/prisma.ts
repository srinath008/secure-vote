import { PrismaClient } from '@prisma/client';

/**
 * Singleton Prisma client.
 * The globalThis trick prevents hot-reload from creating multiple connections
 * in development (ts-node / tsx watch mode).
 */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
