import { z } from 'zod';

export const notificationParamsSchema = z.object({
  notificationId: z.string().uuid(),
});

export const listNotificationsQuerySchema = z.object({
  unreadOnly: z.enum(['true', 'false']).optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const dismissNotificationsSchema = z.object({
  notificationIds: z.array(z.string().uuid()).min(1).max(100),
});

export type ListNotificationsQuery = z.infer<
  typeof listNotificationsQuerySchema
>;
