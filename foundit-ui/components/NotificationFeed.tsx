'use client';

/**
 * NotificationFeed — the shared notification panel for both roles.
 *
 * Students see it in the profile page's Notifications tab; security staff
 * reach the same tab via the navbar bell. Data comes from
 * GET /api/notifications via the useNotifications hook; clicking a card or
 * "Mark all as read" marks notifications read optimistically.
 */

import { Flex, HStack, Spinner, Stack, Text } from '@chakra-ui/react';
import NotificationCard from '@/components/NotificationCard';
import { useNotifications } from '@/hooks/useNotifications';

export default function NotificationFeed() {
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    markRead,
    markAllRead,
  } = useNotifications();

  return (
    <Stack gap={4} w="full">
      <Text fontSize="2xl" fontWeight="bold" color="gray.900">
        Notifications
      </Text>

      <HStack justify="flex-end" gap={4}>
        <Text fontSize="md" fontWeight="medium" color="gray.600">
          {unreadCount} unread
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
      ) : notifications.length === 0 ? (
        <Text fontSize="sm" color="gray.500" textAlign="center" py={10}>
          You&apos;re all caught up — no notifications yet.
        </Text>
      ) : (
        <Stack gap={4}>
          {notifications.map((notification) => (
            <NotificationCard
              key={notification.notificationId}
              title={notification.title}
              message={notification.message}
              isRead={notification.isRead}
              createdAt={notification.createdAt}
              onClick={() => markRead(notification.notificationId)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
