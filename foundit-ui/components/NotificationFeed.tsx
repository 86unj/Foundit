'use client';

/**
 * NotificationFeed — the shared notification panel for both roles.
 *
 * Students see it in the profile page's Notifications tab; security staff
 * reach the same tab via the navbar bell. Data comes from
 * GET /api/notifications via the useNotifications hook; clicking a card marks
 * it read, the status circle toggles read ⇄ unread, and "Unread" filters the
 * list. All updates are optimistic.
 *
 * The Unread filter is client-side, which is correct only while the full
 * list is loaded in one request — move it server-side (?unreadOnly=true)
 * when pagination lands.
 */

import { Flex, HStack, Spinner, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';
import NotificationCard from '@/components/NotificationCard';
import { useNotifications } from '@/hooks/useNotifications';

export default function NotificationFeed() {
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    markRead,
    markUnread,
    markAllRead,
  } = useNotifications();

  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const visibleNotifications = showUnreadOnly
    ? notifications.filter((n) => !n.isRead)
    : notifications;

  return (
    <Stack gap={4} w="full">
      <Text fontSize="2xl" fontWeight="bold" color="gray.900">
        Notifications
      </Text>

      <HStack justify="flex-end" gap={4}>
        <Text
          as="button"
          fontSize="md"
          fontWeight="medium"
          color={showUnreadOnly ? 'blue.500' : 'gray.600'}
          textDecoration={showUnreadOnly ? 'underline' : 'none'}
          cursor="pointer"
          aria-pressed={showUnreadOnly}
          onClick={() => setShowUnreadOnly((prev) => !prev)}
        >
          Unread ({unreadCount})
        </Text>
        <Text
          as="button"
          fontSize="md"
          fontWeight="medium"
          color="blue.500"
          cursor="pointer"
          onClick={markAllRead}
        >
          Mark all as read
        </Text>
      </HStack>

      {isLoading ? (
        <Flex align="center" justify="center" py={10}>
          <Spinner size="lg" color="blue.500" />
        </Flex>
      ) : error ? (
        <Text fontSize="sm" color="fg.error" textAlign="center" py={10}>
          Could not load notifications. Please try again later.
        </Text>
      ) : visibleNotifications.length === 0 ? (
        <Text fontSize="sm" color="gray.500" textAlign="center" py={10}>
          {showUnreadOnly
            ? 'No unread notifications.'
            : "You're all caught up — no notifications yet."}
        </Text>
      ) : (
        <Stack gap={4}>
          {visibleNotifications.map((notification) => (
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
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
