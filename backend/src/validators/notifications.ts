import { z } from 'zod';

export const notificationParamsSchema = z.object({
  notificationId: z.string().uuid(),
});

export const listNotificationsQuerySchema = z.object({
  unreadOnly: z.enum(['true', 'false']).optional(),
});

export type ListNotificationsQuery = z.infer<
  typeof listNotificationsQuerySchema
>;
