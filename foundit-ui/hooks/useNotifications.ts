'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/api/notifications';
import type { AppNotification } from '@/types/notifications';

/**
 * Loads the signed-in user's notification feed and exposes mark-read actions.
 *
 * Mark-read updates are optimistic: the UI flips immediately and rolls back
 * to the server state on failure (by refetching).
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumping this key re-runs the fetch effect (initial load + reloads).
  const [loadKey, setLoadKey] = useState(0);

  const reload = useCallback(() => setLoadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchNotifications();
        if (cancelled) {
          return;
        }
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Something went wrong');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [loadKey]);

  const markRead = useCallback(
    async (notificationId: string) => {
      const target = notifications.find(
        (n) => n.notificationId === notificationId
      );
      if (!target || target.isRead) {
        return;
      }

      setNotifications((prev) =>
        prev.map((n) =>
          n.notificationId === notificationId ? { ...n, isRead: true } : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        await markNotificationRead(notificationId);
      } catch {
        reload();
      }
    },
    [notifications, reload]
  );

  const markAllRead = useCallback(async () => {
    if (unreadCount === 0) {
      return;
    }

    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);

    try {
      await markAllNotificationsRead();
    } catch {
      reload();
    }
  }, [unreadCount, reload]);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    markRead,
    markAllRead,
    reload,
  };
}
