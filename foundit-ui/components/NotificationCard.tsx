import {
  Box,
  Circle,
  Flex,
  HStack,
  Text,
  VStack,
  Checkmark,
} from '@chakra-ui/react';
import { getRelativeTime } from '@/utils/relativeDate';

interface NotificationCardProps {
  title: string;
  message: string;
  isRead?: boolean;
  createdAt: string;
  /** Fires when the card is clicked — used to mark the notification read. */
  onClick?: () => void;
}

export default function NotificationCard({
  title,
  message,
  isRead = false,
  createdAt,
  onClick,
}: NotificationCardProps) {
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
      cursor={onClick ? 'pointer' : undefined}
      _hover={onClick ? { bg: 'gray.50' } : undefined}
      onClick={onClick}
    >
      <Box w="4px" bg={isRead ? 'transparent' : 'blue.500'} />
      <HStack w="full" px={6} py={4} gap={4} align="center">
        {/* Read / unread icon */}
        {isRead ? (
          <Circle size="18px" borderWidth="1px" borderColor="gray.500">
            <Checkmark checked size="md" variant="plain" />{' '}
          </Circle>
        ) : (
          <Circle
            size="18px"
            borderWidth="2px"
            borderColor="black"
            bg="white"
          />
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
