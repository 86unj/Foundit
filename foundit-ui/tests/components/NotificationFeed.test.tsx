import { fireEvent, screen } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationFeed from '@/components/NotificationFeed';
import { useNotifications } from '@/hooks/useNotifications';
import type { AppNotification } from '@/types/notifications';
import { renderWithProvider } from '../testUtils';

const pushMock = vi.fn();

vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/utils/auth', async () => {
  const actual =
    await vi.importActual<typeof import('@/utils/auth')>('@/utils/auth');
  return {
    ...actual,
    getSessionRole: vi.fn(() => 'student' as const),
  };
});

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
  {
    notificationId: 'n-3',
    type: 'item_expiring',
    title: 'Item retention expired',
    message: '1 stored item reached the end of retention.',
    referenceType: null,
    referenceId: null,
    isRead: false,
    createdAt: '2026-07-07T12:00:00.000Z',
  },
];

function hookState(
  overrides: Partial<ReturnType<typeof useNotifications>> = {}
): ReturnType<typeof useNotifications> {
  return {
    notifications,
    unreadCount: 2,
    nextCursor: null,
    isLoading: false,
    isLoadingMore: false,
    error: null,
    markRead: vi.fn(),
    markUnread: vi.fn(),
    markAllRead: vi.fn(),
    dismiss: vi.fn(),
    loadMore: vi.fn(),
    reload: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useNotifications>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NotificationFeed', () => {
  it('renders a card per notification with All and Unread filters', () => {
    useNotificationsMock.mockReturnValue(hookState());

    renderWithProvider(<NotificationFeed />);

    expect(screen.getByText('New Claim Submitted')).toBeDefined();
    expect(screen.getByText('Match found')).toBeDefined();
    expect(screen.getByRole('button', { name: 'All' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Unread 2' })).toBeDefined();
    expect(useNotificationsMock).toHaveBeenCalledWith({ unreadOnly: false });
  });

  it('passes unreadOnly when Unread is selected', () => {
    useNotificationsMock.mockReturnValue(hookState());

    renderWithProvider(<NotificationFeed />);
    fireEvent.click(screen.getByRole('button', { name: 'Unread 2' }));

    expect(useNotificationsMock).toHaveBeenLastCalledWith({ unreadOnly: true });
  });

  it('returns to All when All is selected after Unread', () => {
    useNotificationsMock.mockReturnValue(hookState());

    renderWithProvider(<NotificationFeed />);
    fireEvent.click(screen.getByRole('button', { name: 'Unread 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'All' }));

    expect(useNotificationsMock).toHaveBeenLastCalledWith({
      unreadOnly: false,
    });
  });

  it('shows the filtered empty state when everything is read', () => {
    useNotificationsMock.mockReturnValue(
      hookState({
        notifications: [],
        unreadCount: 0,
      })
    );

    renderWithProvider(<NotificationFeed />);
    fireEvent.click(screen.getByRole('button', { name: 'Unread 0' }));

    expect(screen.getByText('No unread notifications.')).toBeDefined();
  });

  it('marks read and navigates when a linkable card is clicked', () => {
    const state = hookState();
    useNotificationsMock.mockReturnValue(state);

    renderWithProvider(<NotificationFeed />);
    fireEvent.click(screen.getByText('New Claim Submitted'));

    expect(state.markRead).toHaveBeenCalledWith('n-1');
    expect(pushMock).toHaveBeenCalledWith('/student/my-claims?claimId=c-1');
  });

  it('marks read without navigating for non-linkable cards', () => {
    const state = hookState();
    useNotificationsMock.mockReturnValue(state);

    renderWithProvider(<NotificationFeed />);
    fireEvent.click(screen.getByText('Item retention expired'));

    expect(state.markRead).toHaveBeenCalledWith('n-3');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('marks everything read via the header link', async () => {
    const state = hookState();
    useNotificationsMock.mockReturnValue(state);

    renderWithProvider(<NotificationFeed />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));

    expect(state.markAllRead).toHaveBeenCalledTimes(1);
  });

  it('dismisses a notification from its close button', async () => {
    const state = hookState();
    useNotificationsMock.mockReturnValue(state);

    renderWithProvider(<NotificationFeed />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss New Claim Submitted' })
    );

    expect(state.dismiss).toHaveBeenCalledWith(['n-1']);
  });

  it('shows Load more when nextCursor is set and calls loadMore', () => {
    const state = hookState({ nextCursor: 'n-2' });
    useNotificationsMock.mockReturnValue(state);

    renderWithProvider(<NotificationFeed />);
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(state.loadMore).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state when there are no notifications', () => {
    useNotificationsMock.mockReturnValue(
      hookState({ notifications: [], unreadCount: 0 })
    );

    renderWithProvider(<NotificationFeed />);

    expect(screen.getByText(/no notifications yet/i)).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Mark all as read' })
    ).toBeDefined();
  });

  it('shows an error message when loading failed', () => {
    useNotificationsMock.mockReturnValue(
      hookState({ notifications: [], unreadCount: 0, error: 'boom' })
    );

    renderWithProvider(<NotificationFeed />);

    expect(screen.getByText(/could not load notifications/i)).toBeDefined();
  });
});
