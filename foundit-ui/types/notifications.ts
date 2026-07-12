/** Mirrors backend NotificationType (backend/prisma/schema.prisma). */
export type NotificationType =
  | 'claim_status_update'
  | 'match_found'
  | 'item_expiring'
  | 'report_confirmation';

/** One row from GET /api/notifications. */
export interface AppNotification {
  notificationId: string;
  type: NotificationType;
  title: string;
  message: string;
  referenceType: string | null;
  referenceId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationListResponse {
  notifications: AppNotification[];
  unreadCount: number;
}
