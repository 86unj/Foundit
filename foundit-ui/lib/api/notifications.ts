import { authFetch, parseApiError } from '@/lib/api/client';
import type {
  AppNotification,
  NotificationListResponse,
} from '@/types/notifications';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export async function fetchNotifications(options?: {
  unreadOnly?: boolean;
}): Promise<NotificationListResponse> {
  const query = options?.unreadOnly ? '?unreadOnly=true' : '';
  const res = await authFetch(`${API_BASE}/api/notifications${query}`);

  if (!res.ok) {
    throw new Error(await parseApiError(res));
  }

  return res.json() as Promise<NotificationListResponse>;
}

export async function markNotificationRead(
  notificationId: string
): Promise<AppNotification> {
  const res = await authFetch(
    `${API_BASE}/api/notifications/${notificationId}/read`,
    { method: 'PATCH' }
  );

  if (!res.ok) {
    throw new Error(await parseApiError(res));
  }

  return res.json() as Promise<AppNotification>;
}

export async function markAllNotificationsRead(): Promise<{
  updatedCount: number;
}> {
  const res = await authFetch(`${API_BASE}/api/notifications/read-all`, {
    method: 'PATCH',
  });

  if (!res.ok) {
    throw new Error(await parseApiError(res));
  }

  return res.json() as Promise<{ updatedCount: number }>;
}
