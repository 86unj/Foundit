'use client';

/**
 * Shares the unread-notification count between the navbar account badge and
 * the notification feed, so marking cards read updates the badge instantly.
 *
 * Optional by design: components fall back to their own state when no
 * provider is mounted (guest pages, isolated tests).
 */

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

interface NotificationsBadgeValue {
  unreadCount: number;
  setUnreadCount: Dispatch<SetStateAction<number>>;
}

const NotificationsContext = createContext<NotificationsBadgeValue | null>(
  null
);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const value = useMemo(() => ({ unreadCount, setUnreadCount }), [unreadCount]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

/** Null when no provider is mounted — callers must handle the fallback. */
export function useNotificationsBadge(): NotificationsBadgeValue | null {
  return useContext(NotificationsContext);
}
