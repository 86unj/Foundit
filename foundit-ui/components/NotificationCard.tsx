import {
  Box,
  Circle,
  Flex,
  HStack,
  Text,
  VStack,
  Checkmark,
} from '@chakra-ui/react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { getRelativeTime } from '@/utils/relativeDate';

interface NotificationCardProps {
  title: string;
  message: string;
  isRead?: boolean;
  createdAt: string;
  /** Fires when the card body is clicked — used to mark the notification read. */
  onClick?: () => void;
  /** Fires when the status circle is clicked — toggles read ⇄ unread. */
  onToggleRead?: () => void;
}

export default function NotificationCard({
  title,
  message,
  isRead = false,
  createdAt,
  onClick,
  onToggleRead,
}: NotificationCardProps) {
  const handleCardKeyDown = (event: KeyboardEvent) => {
    if (onClick && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onClick();
    }
  };

  const handleToggleClick = (event: MouseEvent) => {
    // Don't let the card's mark-read onClick swallow the toggle.
    event.stopPropagation();
    onToggleRead?.();
  };

  const statusCircle = isRead ? (
    <Circle size="18px" borderWidth="1px" borderColor="gray.500">
      <Checkmark checked size="md" variant="plain" />{' '}
    </Circle>
  ) : (
    <Circle size="18px" borderWidth="2px" borderColor="black" bg="white" />
  );

  return (
    <Flex
      w="full"
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
      boxShadow="sm"
      borderRadius="sm"
      overflow="hidden"
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      cursor={onClick ? 'pointer' : undefined}
      _hover={onClick ? { bg: 'gray.50' } : undefined}
      onClick={onClick}
      onKeyDown={handleCardKeyDown}
    >
      <Box w="4px" bg={isRead ? 'transparent' : 'blue.500'} />
      <HStack w="full" px={6} py={4} gap={4} align="center">
        {/* Read / unread status — a toggle button when the feed wires it up. */}
        {onToggleRead ? (
          <Box
            as="button"
            aria-label={isRead ? 'Mark as unread' : 'Mark as read'}
            cursor="pointer"
            onClick={handleToggleClick}
          >
            {statusCircle}
          </Box>
        ) : (
          statusCircle
        )}

        <VStack align="start" gap={1} flex={1}>
          <Text fontSize="sm" fontWeight="semibold" color="fg">
            {title}
          </Text>

          <Text fontSize="sm" color="gray.600">
            {message}
          </Text>
        </VStack>

        <Text fontSize="xs" color="gray.500" whiteSpace="nowrap">
          {getRelativeTime(createdAt)}
        </Text>
      </HStack>
    </Flex>
  );
}
