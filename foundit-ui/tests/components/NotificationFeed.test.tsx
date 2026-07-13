import { fireEvent, screen } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationFeed from '@/components/NotificationFeed';
import { useNotifications } from '@/hooks/useNotifications';
import type { AppNotification } from '@/types/notifications';
import { renderWithProvider } from '../testUtils';

vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: vi.fn(),
}));

const useNotificationsMock = vi.mocked(useNotifications);

const notifications: AppNotification[] = [
  {
    notificationId: 'n-1',
    type: 'claim_status_update',
    title: 'New Claim Submitted',
    message: 'A claim was submitted by a student.',
    referenceType: 'claim',
    referenceId: 'c-1',
    isRead: false,
    createdAt: '2026-07-10T12:00:00.000Z',
  },
  {
    notificationId: 'n-2',
    type: 'match_found',
    title: 'Match found',
    message: 'We found a possible match for your claim.',
    referenceType: 'claim',
    referenceId: 'c-2',
    isRead: true,
    createdAt: '2026-07-08T12:00:00.000Z',
  },
];

function hookState(
  overrides: Partial<ReturnType<typeof useNotifications>> = {}
): ReturnType<typeof useNotifications> {
  return {
    notifications,
    unreadCount: 1,
    isLoading: false,
    error: null,
    markRead: vi.fn(),
    markUnread: vi.fn(),
    markAllRead: vi.fn(),
    reload: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NotificationFeed', () => {
  it('renders a card per notification with the unread count', () => {
    useNotificationsMock.mockReturnValue(hookState());

    renderWithProvider(<NotificationFeed />);

    expect(screen.getByText('New Claim Submitted')).toBeDefined();
    expect(screen.getByText('Match found')).toBeDefined();
    expect(screen.getByText('Unread ( 1 )')).toBeDefined();
  });

  it('filters to unread cards when the Unread button is toggled', () => {
    useNotificationsMock.mockReturnValue(hookState());

    renderWithProvider(<NotificationFeed />);
    fireEvent.click(screen.getByRole('button', { name: 'Unread ( 1 )' }));

    expect(screen.getByText('New Claim Submitted')).toBeDefined();
    expect(screen.queryByText('Match found')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Unread ( 1 )' }));
    expect(screen.getByText('Match found')).toBeDefined();
  });

  it('shows the filtered empty state when everything is read', () => {
    useNotificationsMock.mockReturnValue(
      hookState({
        notifications: notifications.map((n) => ({ ...n, isRead: true })),
        unreadCount: 0,
      })
    );

    renderWithProvider(<NotificationFeed />);
    fireEvent.click(screen.getByRole('button', { name: 'Unread ( 0 )' }));

    expect(screen.getByText('No unread notifications.')).toBeDefined();
  });

  it("toggling a read card's circle calls markUnread", () => {
    const state = hookState();
    useNotificationsMock.mockReturnValue(state);

    renderWithProvider(<NotificationFeed />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark as unread' }));

    expect(state.markUnread).toHaveBeenCalledWith('n-2');
    expect(state.markRead).not.toHaveBeenCalled();
  });

  it('marks a notification read when its card is clicked', async () => {
    const state = hookState();
    useNotificationsMock.mockReturnValue(state);

    renderWithProvider(<NotificationFeed />);
    fireEvent.click(screen.getByText('New Claim Submitted'));

    expect(state.markRead).toHaveBeenCalledWith('n-1');
  });

  it('marks everything read via the header link', async () => {
    const state = hookState();
    useNotificationsMock.mockReturnValue(state);

    renderWithProvider(<NotificationFeed />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));

    expect(state.markAllRead).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when there are no notifications', () => {
    useNotificationsMock.mockReturnValue(
      hookState({ notifications: [], unreadCount: 0 })
    );

    renderWithProvider(<NotificationFeed />);

    expect(screen.getByText(/no notifications yet/i)).toBeDefined();
  });

  it('shows an error message when loading failed', () => {
    useNotificationsMock.mockReturnValue(
      hookState({ notifications: [], unreadCount: 0, error: 'boom' })
    );

    renderWithProvider(<NotificationFeed />);

    expect(screen.getByText(/could not load notifications/i)).toBeDefined();
  });
});
