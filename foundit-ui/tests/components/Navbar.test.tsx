import { act, fireEvent, screen, waitFor } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import Navbar from '@/components/Navbar';
import { fetchNotifications } from '@/lib/api/notifications';
import { NOTIFICATIONS_PATH } from '@/utils/routes';
import { renderWithProvider } from '../testUtils';
import { clearProfilePhoto, setProfilePhoto } from '@/utils/profilePhotoStore';

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

describe('Navbar notifications entry', () => {
  it('shows the unread badge for authenticated users', async () => {
    renderWithProvider(<Navbar variant="security" userName="Rendell V" />);

    const accountMenu = await screen.findByLabelText(
      'Account menu, 3 unread notifications'
    );

    fireEvent.click(accountMenu);

    expect(await screen.findByText('Notifications')).toBeDefined();
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
  });

  it('navigates to the notifications tab from the account menu', async () => {
    renderWithProvider(<Navbar variant="student" userName="Casey H" />);

    fireEvent.click(await screen.findByLabelText(/Account menu/));
    fireEvent.click(await screen.findByText('Notifications'));

    expect(pushMock).toHaveBeenCalledWith(NOTIFICATIONS_PATH);
  });

  it('hides the notifications entry and skips the fetch for guests', () => {
    renderWithProvider(<Navbar variant="guest" />);

    expect(screen.queryByText('Notifications')).toBeNull();
    expect(fetchNotificationsMock).not.toHaveBeenCalled();
  });
});

describe('Navbar avatar', () => {
  beforeEach(() => {
    clearProfilePhoto();
  });

  it('falls back to the account icon when no photo is set', async () => {
    const { container } = renderWithProvider(
      <Navbar variant="student" userName="Casey H" />
    );

    await screen.findByLabelText(/Account menu/);
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders the profile photo once one is set', async () => {
    renderWithProvider(<Navbar variant="student" userName="Casey H" />);
    await screen.findByLabelText(/Account menu/);

    act(() => setProfilePhoto('https://cdn.test.local/avatars/a.png'));

    await waitFor(() => {
      const img = document.querySelector('img');
      expect(img?.getAttribute('src')).toBe(
        'https://cdn.test.local/avatars/a.png'
      );
    });
  });

  it('drops the photo on sign-out so the next account does not inherit it', async () => {
    renderWithProvider(<Navbar variant="student" userName="Casey H" />);
    await screen.findByLabelText(/Account menu/);

    act(() => setProfilePhoto('https://cdn.test.local/avatars/a.png'));
    await waitFor(() => expect(document.querySelector('img')).not.toBeNull());

    act(() => clearProfilePhoto());
    await waitFor(() => expect(document.querySelector('img')).toBeNull());
  });
});
