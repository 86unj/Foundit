import { fireEvent, screen } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';
import NotificationCard from '@/components/NotificationCard';
import { renderWithProvider } from '../testUtils';

const baseProps = {
  title: 'New Claim Submitted',
  message: 'A claim was submitted by a student.',
  createdAt: '2026-07-10T12:00:00.000Z',
};

describe('NotificationCard', () => {
  it('renders the title and message', () => {
    renderWithProvider(<NotificationCard {...baseProps} isRead={false} />);

    expect(screen.getByText('New Claim Submitted')).toBeDefined();
    expect(
      screen.getByText('A claim was submitted by a student.')
    ).toBeDefined();
  });

  it('is not interactive without an onClick handler', () => {
    renderWithProvider(<NotificationCard {...baseProps} isRead />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('fires onClick when the card is clicked', async () => {
    const onClick = vi.fn();
    renderWithProvider(
      <NotificationCard {...baseProps} isRead={false} onClick={onClick} />
    );

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
