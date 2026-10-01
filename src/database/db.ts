import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function logActivity(eventType: string, description: string, metadata?: any) {
  try {
    await prisma.activityLog.create({
      data: {
        eventType,
        description,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}
