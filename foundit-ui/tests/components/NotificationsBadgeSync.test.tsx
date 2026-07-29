import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Navbar from '@/components/Navbar';
import NotificationFeed from '@/components/NotificationFeed';
import { NotificationsProvider } from '@/components/NotificationsProvider';
import {
  fetchNotifications,
  markNotificationRead,
} from '@/lib/api/notifications';
import type { AppNotification } from '@/types/notifications';
import { renderWithProvider } from '../testUtils';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/student/dashboard',
}));

vi.mock('@/lib/api/notifications', () => ({
  fetchNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markNotificationUnread: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

const fetchNotificationsMock = vi.mocked(fetchNotifications);
const markNotificationReadMock = vi.mocked(markNotificationRead);

const unread: AppNotification = {
  notificationId: 'n-1',
  type: 'claim_status_update',
  title: 'Claim status updated: approved',
  message: 'Your claim for "iPhone 15" is now approved.',
  referenceType: 'claim',
  referenceId: 'c-1',
  isRead: false,
  createdAt: '2026-07-10T12:00:00.000Z',
};

function renderNavbarAndFeed() {
  return renderWithProvider(
    <NotificationsProvider>
      <Navbar variant="student" userName="Casey H" />
      <NotificationFeed />
    </NotificationsProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchNotificationsMock.mockResolvedValue({
    notifications: [unread],
    unreadCount: 1,
  });
});

describe('Navbar + NotificationFeed badge sync', () => {
  it('drops the navbar badge to zero when the feed marks the only unread notification read', async () => {
    markNotificationReadMock.mockResolvedValue({ ...unread, isRead: true });

    renderNavbarAndFeed();

    await screen.findByLabelText('Account menu, 1 unread notification');
    expect(await screen.findByText('Unread ( 1 )')).toBeDefined();

    fireEvent.click(screen.getByText(unread.title));

    await waitFor(() =>
      expect(markNotificationReadMock).toHaveBeenCalledWith('n-1')
    );
    await screen.findByLabelText('Account menu');
    expect(screen.getByText('Unread ( 0 )')).toBeDefined();
  });
});
