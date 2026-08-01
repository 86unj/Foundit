'use client';

/**
 * NotificationFeed — the shared notification panel for both roles.
 *
 * Students see it in the profile page's Notifications tab; security staff
 * reach the same tab via the navbar bell. Data comes from
 * GET /api/notifications via the useNotifications hook; clicking a card marks
 * it read, the status circle toggles read ⇄ unread, and the × control dismisses
 * a single notification. "Unread" filters server-side (?unreadOnly=true).
 * Pages load 10 at a time with Load more.
 */

import { Flex, HStack, Spinner, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';
import NotificationCard from '@/components/NotificationCard';
import Button from '@/components/ui/Button';
import { useNotifications } from '@/hooks/useNotifications';

export default function NotificationFeed() {
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
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

  return (
    <Stack gap={4} w="full" minW={0}>
      <Text
        fontSize={{ base: 'xl', md: '2xl' }}
        fontWeight="bold"
        color="gray.900"
      >
        Notifications
      </Text>

      <Flex align="center" justify="flex-end" gap={4} flexWrap="wrap">
        <HStack gap={4}>
          <Text
            as="button"
            fontSize={{ base: 'sm', md: 'md' }}
            fontWeight="medium"
            color={showUnreadOnly ? 'blue.500' : 'gray.600'}
            textDecoration={showUnreadOnly ? 'underline' : 'none'}
            cursor="pointer"
            aria-pressed={showUnreadOnly}
            onClick={() => setShowUnreadOnly((prev) => !prev)}
          >
            Unread ( {unreadCount} )
          </Text>
          <Text
            as="button"
            fontSize={{ base: 'sm', md: 'md' }}
            fontWeight="medium"
            color="blue.500"
            cursor="pointer"
            onClick={markAllRead}
          >
            Mark all as read
          </Text>
        </HStack>
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
        <Stack gap={2}>
          {notifications.map((notification) => (
            <NotificationCard
              key={notification.notificationId}
              title={notification.title}
              message={notification.message}
              isRead={notification.isRead}
              createdAt={notification.createdAt}
              onClick={() => markRead(notification.notificationId)}
              onToggleRead={() =>
                notification.isRead
                  ? markUnread(notification.notificationId)
                  : markRead(notification.notificationId)
              }
              onDismiss={() => void dismissOne(notification.notificationId)}
            />
          ))}

          {nextCursor ? (
            <Flex justify="center">
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
