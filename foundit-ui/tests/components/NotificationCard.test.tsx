import { fireEvent, screen, waitFor } from '@testing-library/react';

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

  it('fires onClick via keyboard (Enter) on the card', () => {
    const onClick = vi.fn();
    renderWithProvider(
      <NotificationCard {...baseProps} isRead={false} onClick={onClick} />
    );

    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('circle toggle fires onToggleRead without firing the card onClick', () => {
    const onClick = vi.fn();
    const onToggleRead = vi.fn();
    renderWithProvider(
      <NotificationCard
        {...baseProps}
        isRead
        onClick={onClick}
        onToggleRead={onToggleRead}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mark as unread' }));

    expect(onToggleRead).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('labels the toggle "Mark as read" when the card is unread', () => {
    renderWithProvider(
      <NotificationCard {...baseProps} isRead={false} onToggleRead={vi.fn()} />
    );

    expect(screen.getByRole('button', { name: 'Mark as read' })).toBeDefined();
  });

  it('changes selection without firing the card click', async () => {
    const onClick = vi.fn();
    const onSelectedChange = vi.fn();
    renderWithProvider(
      <NotificationCard
        {...baseProps}
        onClick={onClick}
        onSelectedChange={onSelectedChange}
      />
    );

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Select New Claim Submitted' })
    );

    await waitFor(() => expect(onSelectedChange).toHaveBeenCalledWith(true));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not trigger the card action from checkbox keyboard events', () => {
    const onClick = vi.fn();
    renderWithProvider(
      <NotificationCard
        {...baseProps}
        onClick={onClick}
        onSelectedChange={vi.fn()}
      />
    );

    fireEvent.keyDown(
      screen.getByRole('checkbox', { name: 'Select New Claim Submitted' }),
      { key: ' ' }
    );

    expect(onClick).not.toHaveBeenCalled();
  });
});
