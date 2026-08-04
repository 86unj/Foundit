import { apiFetch } from '@/lib/api/client';
import type {
  AppNotification,
  FetchNotificationsOptions,
  NotificationListResponse,
} from '@/types/notifications';

export async function fetchNotifications(
  options?: FetchNotificationsOptions
): Promise<NotificationListResponse> {
  const params = new URLSearchParams();
  if (options?.unreadOnly) {
    params.set('unreadOnly', 'true');
  }
  if (options?.cursor) {
    params.set('cursor', options.cursor);
  }
  if (options?.limit != null) {
    params.set('limit', String(options.limit));
  }

  const query = params.toString();
  return apiFetch<NotificationListResponse>(
    `/api/notifications${query ? `?${query}` : ''}`
  );
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
