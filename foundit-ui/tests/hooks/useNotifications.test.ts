import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dismissNotifications,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
} from '@/lib/api/notifications';
import { useNotifications } from '@/hooks/useNotifications';
import type { AppNotification } from '@/types/notifications';

vi.mock('@/lib/api/notifications', () => ({
  fetchNotifications: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
  markNotificationUnread: vi.fn(),
  dismissNotifications: vi.fn(),
}));

const fetchNotificationsMock = vi.mocked(fetchNotifications);
const markNotificationReadMock = vi.mocked(markNotificationRead);
const markNotificationUnreadMock = vi.mocked(markNotificationUnread);
const markAllNotificationsReadMock = vi.mocked(markAllNotificationsRead);
const dismissNotificationsMock = vi.mocked(dismissNotifications);

const unread: AppNotification = {
  notificationId: 'n-1',
  type: 'claim_status_update',
  title: 'New Claim Submitted',
  message: 'A claim was submitted by a student.',
  referenceType: 'claim',
  referenceId: 'c-1',
  isRead: false,
  createdAt: '2026-07-10T12:00:00.000Z',
};

const read: AppNotification = {
  notificationId: 'n-2',
  type: 'match_found',
  title: 'Match found',
  message: 'We found a possible match for your claim.',
  referenceType: 'claim',
  referenceId: 'c-2',
  isRead: true,
  createdAt: '2026-07-08T12:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchNotificationsMock.mockResolvedValue({
    notifications: [unread, read],
    unreadCount: 1,
    nextCursor: null,
  });
});

describe('useNotifications', () => {
  it('loads notifications and the unread count on mount', async () => {
    const { result } = renderHook(() => useNotifications());

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.notifications).toHaveLength(2);
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.nextCursor).toBeNull();
    expect(result.current.error).toBeNull();
    expect(fetchNotificationsMock).toHaveBeenCalledWith({
      unreadOnly: false,
      limit: 10,
    });
  });

  it('passes unreadOnly when filtering', async () => {
    const { result } = renderHook(() => useNotifications({ unreadOnly: true }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchNotificationsMock).toHaveBeenCalledWith({
      unreadOnly: true,
      limit: 10,
    });
  });

  it('appends the next page via loadMore', async () => {
    const page2: AppNotification = {
      ...read,
      notificationId: 'n-3',
      title: 'Older notice',
    };
    fetchNotificationsMock
      .mockResolvedValueOnce({
        notifications: [unread, read],
        unreadCount: 1,
        nextCursor: 'n-2',
      })
      .mockResolvedValueOnce({
        notifications: [page2],
        unreadCount: 1,
        nextCursor: null,
      });

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.nextCursor).toBe('n-2');

    await act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.nextCursor).toBeNull());
    expect(result.current.notifications).toHaveLength(3);
    expect(fetchNotificationsMock).toHaveBeenLastCalledWith({
      unreadOnly: false,
      cursor: 'n-2',
      limit: 10,
    });
  });

  it('exposes an error message when loading fails', async () => {
    fetchNotificationsMock.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('boom');
    expect(result.current.notifications).toHaveLength(0);
  });

  it('optimistically marks a notification read', async () => {
    markNotificationReadMock.mockResolvedValue({ ...unread, isRead: true });

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.markRead('n-1'));

    expect(
      result.current.notifications.find((n) => n.notificationId === 'n-1')
        ?.isRead
    ).toBe(true);
    expect(result.current.unreadCount).toBe(0);
    expect(markNotificationReadMock).toHaveBeenCalledWith('n-1');
  });

  it('skips the request for an already-read notification', async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.markRead('n-2'));

    expect(markNotificationReadMock).not.toHaveBeenCalled();
  });

  it('refetches to roll back when marking read fails', async () => {
    markNotificationReadMock.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.markRead('n-1'));

    // Initial load + rollback refetch.
    await waitFor(() =>
      expect(fetchNotificationsMock).toHaveBeenCalledTimes(2)
    );
    await waitFor(() => expect(result.current.unreadCount).toBe(1));
    expect(
      result.current.notifications.find((n) => n.notificationId === 'n-1')
        ?.isRead
    ).toBe(false);
  });

  it('optimistically marks a read notification unread', async () => {
    markNotificationUnreadMock.mockResolvedValue({ ...read, isRead: false });

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.markUnread('n-2'));

    expect(
      result.current.notifications.find((n) => n.notificationId === 'n-2')
        ?.isRead
    ).toBe(false);
    expect(result.current.unreadCount).toBe(2);
    expect(markNotificationUnreadMock).toHaveBeenCalledWith('n-2');
  });

  it('skips the request for an already-unread notification', async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.markUnread('n-1'));

    expect(markNotificationUnreadMock).not.toHaveBeenCalled();
  });

  it('refetches to roll back when marking unread fails', async () => {
    markNotificationUnreadMock.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.markUnread('n-2'));

    await waitFor(() =>
      expect(fetchNotificationsMock).toHaveBeenCalledTimes(2)
    );
    await waitFor(() => expect(result.current.unreadCount).toBe(1));
  });

  it('marks everything read via markAllRead', async () => {
    markAllNotificationsReadMock.mockResolvedValue({ updatedCount: 1 });

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.markAllRead());

    expect(result.current.notifications.every((n) => n.isRead)).toBe(true);
    expect(result.current.unreadCount).toBe(0);
    expect(markAllNotificationsReadMock).toHaveBeenCalledTimes(1);
  });

  it('skips markAllRead when nothing is unread', async () => {
    fetchNotificationsMock.mockResolvedValue({
      notifications: [read],
      unreadCount: 0,
      nextCursor: null,
    });

    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.markAllRead());

    expect(markAllNotificationsReadMock).not.toHaveBeenCalled();
  });

  it('optimistically removes selected notifications and updates unread count', async () => {
    dismissNotificationsMock.mockResolvedValue({ updatedCount: 1 });
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.dismiss(['n-1']));

    expect(
      result.current.notifications.map((item) => item.notificationId)
    ).toEqual(['n-2']);
    expect(result.current.unreadCount).toBe(0);
    expect(dismissNotificationsMock).toHaveBeenCalledWith(['n-1']);
  });
});
