import { apiFetch } from '@/lib/api/client';
import type {
  AppNotification,
  NotificationListResponse,
} from '@/types/notifications';

export async function fetchNotifications(options?: {
  unreadOnly?: boolean;
}): Promise<NotificationListResponse> {
  const query = options?.unreadOnly ? '?unreadOnly=true' : '';
  return apiFetch<NotificationListResponse>(`/api/notifications${query}`);
}

export async function markNotificationRead(
  notificationId: string
): Promise<AppNotification> {
  return apiFetch<AppNotification>(
    `/api/notifications/${notificationId}/read`,
    { method: 'PATCH' }
  );
}

export async function markNotificationUnread(
  notificationId: string
): Promise<AppNotification> {
  return apiFetch<AppNotification>(
    `/api/notifications/${notificationId}/unread`,
    { method: 'PATCH' }
  );
}

export async function markAllNotificationsRead(): Promise<{
  updatedCount: number;
}> {
  return apiFetch<{ updatedCount: number }>('/api/notifications/read-all', {
    method: 'PATCH',
  });
}

export async function dismissNotifications(
  notificationIds: string[]
): Promise<{ updatedCount: number }> {
  return apiFetch<{ updatedCount: number }>('/api/notifications/dismiss', {
    method: 'PATCH',
    body: JSON.stringify({ notificationIds }),
  });
}
