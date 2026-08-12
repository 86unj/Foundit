import { Box, Flex, HStack, IconButton, Text, VStack } from '@chakra-ui/react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { LuMail, LuMailOpen, LuX } from 'react-icons/lu';
import { getRelativeTime } from '@/utils/relativeDate';

interface NotificationCardProps {
  title: string;
  message: string;
  isRead?: boolean;
  createdAt: string;
  /** Fires when the card is clicked — mark read (+ navigate in the feed). */
  onClick?: () => void;
  /** Mark as read when currently unread. */
  onMarkRead?: () => void;
  /** Mark as unread when currently read. */
  onMarkUnread?: () => void;
  /** Fires when the dismiss (×) control is clicked. */
  onDismiss?: () => void;
}

export default function NotificationCard({
  title,
  message,
  isRead = false,
  createdAt,
  onClick,
  onMarkRead,
  onMarkUnread,
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

  const handleDismissClick = (event: MouseEvent) => {
    event.stopPropagation();
    onDismiss?.();
  };

  const handleToggleReadClick = (event: MouseEvent) => {
    event.stopPropagation();
    if (isRead) {
      onMarkUnread?.();
    } else {
      onMarkRead?.();
    }
  };

  const canToggleRead = isRead ? Boolean(onMarkUnread) : Boolean(onMarkRead);

  return (
    <Flex
      w="full"
      bg="white"
      borderRadius="md"
      borderWidth="1px"
      borderColor="gray.200"
      overflow="hidden"
      align="stretch"
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      cursor={onClick ? 'pointer' : undefined}
      transition="border-color 0.15s ease, background-color 0.15s ease"
      _hover={
        onClick
          ? {
              borderColor: 'gray.300',
              bg: 'gray.50',
            }
          : undefined
      }
      onClick={onClick ? handleCardClick : undefined}
      onKeyDown={handleCardKeyDown}
    >
      <Box
        w="4px"
        bg={isRead ? 'transparent' : 'blue.500'}
        flexShrink={0}
        aria-hidden
      />
      <HStack w="full" px={4} py={3} gap={3} align="flex-start" minW={0}>
        {canToggleRead ? (
          <IconButton
            type="button"
            data-notification-action
            aria-label={isRead ? 'Mark as unread' : 'Mark as read'}
            variant="ghost"
            size="xs"
            color={isRead ? 'gray.400' : 'blue.500'}
            flexShrink={0}
            mt={0.5}
            _hover={{ color: 'gray.600', bg: 'gray.100' }}
            onClick={handleToggleReadClick}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {isRead ? <LuMailOpen size={16} /> : <LuMail size={16} />}
          </IconButton>
        ) : null}

        <VStack align="start" gap={0.5} flex={1} minW={0}>
          <Text
            fontSize="sm"
            fontWeight={isRead ? 'medium' : 'semibold'}
            color={isRead ? 'gray.700' : 'fg'}
            lineClamp={1}
          >
            {title}
          </Text>

          <Text fontSize="sm" color="fg.muted" lineClamp={2}>
            {message}
          </Text>

          <Text fontSize="xs" color="gray.400" pt={0.5}>
            {getRelativeTime(createdAt)}
          </Text>
        </VStack>

        {onDismiss ? (
          <IconButton
            type="button"
            data-notification-action
            aria-label={`Dismiss ${title}`}
            variant="ghost"
            size="xs"
            color="gray.400"
            flexShrink={0}
            _hover={{ color: 'red.500', bg: 'red.50' }}
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
