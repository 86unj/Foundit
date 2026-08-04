import {
  Box,
  Checkmark,
  Circle,
  Flex,
  HStack,
  IconButton,
  Text,
  VStack,
} from '@chakra-ui/react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { LuX } from 'react-icons/lu';
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
  /** Fires when the dismiss (×) control is clicked. */
  onDismiss?: () => void;
}

export default function NotificationCard({
  title,
  message,
  isRead = false,
  createdAt,
  onClick,
  onToggleRead,
  onDismiss,
}: NotificationCardProps) {
  const handleCardKeyDown = (event: KeyboardEvent) => {
    if (onClick && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onClick();
    }
  };

  const handleCardClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-notification-action]')) return;
    onClick?.();
  };

  const handleToggleClick = (event: MouseEvent) => {
    event.stopPropagation();
    onToggleRead?.();
  };

  const handleDismissClick = (event: MouseEvent) => {
    event.stopPropagation();
    onDismiss?.();
  };

  const statusCircle = isRead ? (
    <Circle size="18px" borderWidth="2px" borderColor="gray.500">
      <Checkmark checked size="sm" variant="plain" color="gray.500" />
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
      onClick={onClick ? handleCardClick : undefined}
      onKeyDown={handleCardKeyDown}
    >
      <Box w="4px" bg={isRead ? 'transparent' : 'blue.500'} flexShrink={0} />
      <HStack w="full" px={6} py={4} gap={3} align="center" minW={0}>
        {onToggleRead ? (
          <Box
            as="button"
            data-notification-action
            aria-label={isRead ? 'Mark as unread' : 'Mark as read'}
            cursor="pointer"
            flexShrink={0}
            onClick={handleToggleClick}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {statusCircle}
          </Box>
        ) : (
          <Box flexShrink={0}>{statusCircle}</Box>
        )}

        <VStack align="start" gap={1} flex={1} minW={0}>
          <Text
            fontSize="sm"
            fontWeight={isRead ? 'medium' : 'semibold'}
            color={isRead ? 'gray.700' : 'fg'}
          >
            {title}
          </Text>

          <Text fontSize="sm" color="gray.600">
            {message}
          </Text>
        </VStack>

        <Text
          fontSize="xs"
          color="gray.500"
          whiteSpace="nowrap"
          flexShrink={0}
          alignSelf="flex-start"
          pt={0.5}
        >
          {getRelativeTime(createdAt)}
        </Text>

        {onDismiss ? (
          <IconButton
            type="button"
            data-notification-action
            aria-label={`Dismiss ${title}`}
            variant="ghost"
            size="xs"
            color="gray.500"
            flexShrink={0}
            onClick={handleDismissClick}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <LuX size={16} />
          </IconButton>
        ) : null}
      </HStack>
    </Flex>
  );
}
