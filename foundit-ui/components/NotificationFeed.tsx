'use client';

/**
 * NotificationFeed — the shared notification panel for both roles.
 *
 * Students see it in the profile page's Notifications tab; security staff
 * reach the same tab via the navbar bell. Data comes from
 * GET /api/notifications via the useNotifications hook.
 *
 * Card click optimistically marks read (fire-and-forget) then navigates when
 * a claim/item href exists. Mail toggle marks read/unread. Dismiss uses ×.
 * All | Unread filters server-side (?unreadOnly=true). Under Unread, cards that
 * become read stay rendered until the filter changes or the list reloads.
 * Pages load 10 at a time with Load more.
 */

import { Flex, HStack, Spinner, Stack, Text } from '@chakra-ui/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import NotificationCard from '@/components/NotificationCard';
import Button from '@/components/ui/Button';
import { useNotifications } from '@/hooks/useNotifications';
import { getSessionRole } from '@/utils/auth';
import { getNotificationHref } from '@/utils/notificationHref';

export default function NotificationFeed() {
  const router = useRouter();
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const role = getSessionRole();
  const {
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
  } = useNotifications({ unreadOnly: showUnreadOnly });

  const [dismissError, setDismissError] = useState<string | null>(null);

  const dismissOne = async (notificationId: string) => {
    setDismissError(null);
    try {
      await dismiss([notificationId]);
    } catch {
      setDismissError('Could not remove the notification.');
    }
  };

  const openNotification = (notificationId: string, href: string | null) => {
    // Fire-and-forget so navigation is not blocked on the PATCH.
    void markRead(notificationId);
    if (href) {
      router.push(href);
    }
  };

  return (
    <Stack gap={4} w="full" minW={0}>
      <Text
        fontSize={{ base: 'xl', md: '2xl' }}
        fontWeight="bold"
        color="gray.900"
      >
        Notifications
      </Text>

      <Flex align="center" justify="space-between" gap={4} flexWrap="wrap">
        <HStack gap={2} role="group" aria-label="Notification filter">
          <Button
            size="xs"
            variant={!showUnreadOnly ? 'outline' : 'muted'}
            aria-pressed={!showUnreadOnly}
            onClick={() => setShowUnreadOnly(false)}
          >
            All
          </Button>
          <Button
            size="xs"
            variant={showUnreadOnly ? 'outline' : 'muted'}
            aria-pressed={showUnreadOnly}
            onClick={() => setShowUnreadOnly(true)}
          >
            Unread {unreadCount}
          </Button>
        </HStack>

        <Text
          as="button"
          fontSize="sm"
          fontWeight="medium"
          color="blue.500"
          cursor="pointer"
          onClick={markAllRead}
        >
          Mark all as read
        </Text>
      </Flex>

      {dismissError ? (
        <Text fontSize="sm" color="fg.error" role="alert">
          {dismissError}
        </Text>
      ) : null}

      {isLoading ? (
        <Flex align="center" justify="center" py={10}>
          <Spinner size="lg" color="blue.500" />
        </Flex>
      ) : error ? (
        <Text fontSize="sm" color="fg.error" textAlign="center" py={10}>
          Could not load notifications. Please try again later.
        </Text>
      ) : notifications.length === 0 ? (
        <Text fontSize="sm" color="gray.500" textAlign="center" py={10}>
          {showUnreadOnly
            ? 'No unread notifications.'
            : "You're all caught up — no notifications yet."}
        </Text>
      ) : (
        <Stack gap={3}>
          {notifications.map((notification) => {
            const href = getNotificationHref(notification, role);
            return (
              <NotificationCard
                key={notification.notificationId}
                title={notification.title}
                message={notification.message}
                isRead={notification.isRead}
                createdAt={notification.createdAt}
                onClick={() =>
                  openNotification(notification.notificationId, href)
                }
                onMarkRead={() => void markRead(notification.notificationId)}
                onMarkUnread={() =>
                  void markUnread(notification.notificationId)
                }
                onDismiss={() => void dismissOne(notification.notificationId)}
              />
            );
          })}

          {nextCursor ? (
            <Flex justify="center" pt={1}>
              <Button
                variant="outline"
                size="sm"
                onClick={loadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? 'Loading...' : 'Load more'}
              </Button>
            </Flex>
          ) : null}
        </Stack>
      )}
    </Stack>
  );
}
