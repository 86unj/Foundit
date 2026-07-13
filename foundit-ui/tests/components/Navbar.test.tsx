import { fireEvent, screen, waitFor } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import Navbar from '@/components/Navbar';
import { fetchNotifications } from '@/lib/api/notifications';
import { NOTIFICATIONS_PATH } from '@/utils/routes';
import { renderWithProvider } from '../testUtils';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/security/dashboard',
}));

vi.mock('@/lib/api/notifications', () => ({
  fetchNotifications: vi.fn(),
}));

const fetchNotificationsMock = vi.mocked(fetchNotifications);

beforeEach(() => {
  vi.clearAllMocks();
  fetchNotificationsMock.mockResolvedValue({
    notifications: [],
    unreadCount: 3,
  });
});

describe('Navbar notification bell', () => {
  // The desktop nav is display-none below the md breakpoint and jsdom never
  // matches media queries, so query by label instead of by visible role.
  it('shows the bell with the unread badge for authenticated users', async () => {
    renderWithProvider(<Navbar variant="security" userName="Rendell V" />);

    expect(screen.getByLabelText('Notifications')).toBeDefined();
    await waitFor(() => expect(screen.getByText('3')).toBeDefined());
  });

  it('navigates to the notifications tab when the bell is clicked', async () => {
    renderWithProvider(<Navbar variant="student" userName="Casey H" />);

    fireEvent.click(screen.getByLabelText('Notifications'));

    expect(pushMock).toHaveBeenCalledWith(NOTIFICATIONS_PATH);
  });

  it('hides the bell and skips the fetch for guests', () => {
    renderWithProvider(<Navbar variant="guest" />);

    expect(screen.queryByLabelText('Notifications')).toBeNull();
    expect(fetchNotificationsMock).not.toHaveBeenCalled();
  });
});
