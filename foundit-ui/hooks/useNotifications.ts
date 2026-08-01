'use client';

import { useCallback, useEffect, useState, type SetStateAction } from 'react';
import {
  dismissNotifications,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
} from '@/lib/api/notifications';
import { useNotificationsBadge } from '@/components/NotificationsProvider';
import type { AppNotification } from '@/types/notifications';

const PAGE_SIZE = 10;

/**
 * Loads the signed-in user's notification feed and exposes read/unread
 * actions plus cursor pagination.
 *
 * Updates are optimistic: the UI flips immediately and rolls back to the
 * server state on failure (by refetching). When a NotificationsProvider is
 * mounted, unread-count changes are mirrored into it so the navbar bell
 * updates live.
 */
export function useNotifications(options?: { unreadOnly?: boolean }) {
  const unreadOnly = options?.unreadOnly ?? false;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumping this key re-runs the fetch effect (initial load + reloads).
  const [loadKey, setLoadKey] = useState(0);

  const badge = useNotificationsBadge();
  const badgeSetUnreadCount = badge?.setUnreadCount ?? null;

  const updateUnreadCount = useCallback(
    (next: SetStateAction<number>) => {
      setUnreadCount(next);
      badgeSetUnreadCount?.(next);
    },
    [badgeSetUnreadCount]
  );

  const reload = useCallback(() => setLoadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const data = await fetchNotifications({
          unreadOnly,
          limit: PAGE_SIZE,
        });
        if (cancelled) {
          return;
        }
        setNotifications(data.notifications);
        setNextCursor(data.nextCursor);
        updateUnreadCount(data.unreadCount);
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
  }, [loadKey, unreadOnly, updateUnreadCount]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const data = await fetchNotifications({
        unreadOnly,
        cursor: nextCursor,
        limit: PAGE_SIZE,
      });
      setNotifications((prev) => [...prev, ...data.notifications]);
      setNextCursor(data.nextCursor);
      updateUnreadCount(data.unreadCount);
    } catch {
      // Keep the loaded page; user can retry Load more.
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore, unreadOnly, updateUnreadCount]);

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
      updateUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        await markNotificationRead(notificationId);
      } catch {
        reload();
      }
    },
    [notifications, reload, updateUnreadCount]
  );

  const markUnread = useCallback(
    async (notificationId: string) => {
      const target = notifications.find(
        (n) => n.notificationId === notificationId
      );
      if (!target || !target.isRead) {
        return;
      }

      setNotifications((prev) =>
        prev.map((n) =>
          n.notificationId === notificationId ? { ...n, isRead: false } : n
        )
      );
      updateUnreadCount((prev) => prev + 1);

      try {
        await markNotificationUnread(notificationId);
      } catch {
        reload();
      }
    },
    [notifications, reload, updateUnreadCount]
  );

  const markAllRead = useCallback(async () => {
    if (unreadCount === 0) {
      return;
    }

    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    updateUnreadCount(0);

    try {
      await markAllNotificationsRead();
    } catch {
      reload();
    }
  }, [unreadCount, reload, updateUnreadCount]);

  const dismiss = useCallback(
    async (notificationIds: string[]) => {
      if (notificationIds.length === 0) return;

      const selectedIds = new Set(notificationIds);
      const unreadRemoved = notifications.filter(
        (notification) =>
          selectedIds.has(notification.notificationId) && !notification.isRead
      ).length;

      setNotifications((prev) =>
        prev.filter(
          (notification) => !selectedIds.has(notification.notificationId)
        )
      );
      updateUnreadCount((prev) => Math.max(0, prev - unreadRemoved));

      try {
        await dismissNotifications(notificationIds);
      } catch {
        reload();
        throw new Error('Could not remove the selected notifications.');
      }
    },
    [notifications, reload, updateUnreadCount]
  );

  return {
    notifications,
    unreadCount,
    nextCursor,
    isLoading,
    isLoadingMore,
    error,
    markRead,
    markUnread,
    markAllRead,
    dismiss,
    loadMore,
    reload,
  };
}
