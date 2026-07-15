'use client';

import { Box, Flex, Stack, Text, VStack } from '@chakra-ui/react';
import type { SecurityClaimListItem } from '@/types/claims';
import {
  formatClaimDate,
  formatClaimId,
  getClaimCardStatus,
  getClaimItemName,
} from '@/utils/claimDisplay';

interface ClaimCardProps {
  claim: SecurityClaimListItem;
}

export function ClaimCard({ claim }: ClaimCardProps) {
  const { strip, label, color } = getClaimCardStatus(claim);
  const itemName = getClaimItemName(claim);
  const category = claim.item?.category ?? claim.category;

  return (
    <Flex
      w="full"
      bg="transparent"
      borderRadius="md"
      borderWidth="1px"
      borderColor="gray.200"
      overflow="hidden"
      align="stretch"
      transition="border-color 0.15s ease, background-color 0.15s ease"
      _hover={{
        borderColor: 'gray.300',
        bg: 'gray.50',
      }}
    >
      <Box w="4px" bg={strip} flexShrink={0} />

      <Stack
        direction={{ base: 'column', md: 'row' }}
        flex={1}
        px={4}
        py={3}
        justify="space-between"
        align={{ base: 'stretch', md: 'center' }}
        gap={{ base: 2, md: 4 }}
      >
        <VStack align="start" gap={0.5} minW={0}>
          <Text fontWeight="semibold" fontSize="sm" color="fg" lineClamp={1}>
            {itemName}
          </Text>
          <Text fontSize="xs" color="fg.muted" lineClamp={1}>
            {category} · Claim #{formatClaimId(claim.claimId)}
          </Text>
        </VStack>

        <VStack
          align="end"
          gap={0}
          flexShrink={0}
          alignSelf={{ base: 'flex-end', md: 'auto' }}
        >
          <Text fontSize="sm" fontWeight="semibold" color={color}>
            {label}
          </Text>
          <Text fontSize="xs" color="fg.muted">
            {formatClaimDate(claim.updatedAt)}
          </Text>
        </VStack>
      </Stack>
    </Flex>
  );
}
