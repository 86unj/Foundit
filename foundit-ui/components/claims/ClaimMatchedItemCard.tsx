'use client';

import { Flex, Grid, Heading, Image, Stack, Text } from '@chakra-ui/react';
import { IoImageOutline } from 'react-icons/io5';
import type { SecurityClaimDetail } from '@/types/claims';
import { formatClaimDate } from '@/utils/claimDisplay';
import { ClaimCard } from './ClaimCard';

function formatItemId(itemId: string): string {
  return itemId.slice(0, 8).toUpperCase();
}

interface ClaimMatchedItemCardProps {
  claim: SecurityClaimDetail;
}

export function ClaimMatchedItemCard({ claim }: ClaimMatchedItemCardProps) {
  const item = claim.item;
  if (!item) return null;

  return (
    <ClaimCard>
      <Heading as="h2" fontSize="lg" fontWeight="bold" color="gray.900" mb={4}>
        Matched Item
      </Heading>
      <Grid templateColumns="72px 1fr" gap={3} alignItems="start">
        <Flex
          w="72px"
          h="72px"
          borderRadius="md"
          bg="gray.100"
          borderWidth="1px"
          borderColor="gray.200"
          align="center"
          justify="center"
          overflow="hidden"
          color="gray.400"
          fontSize="2xl"
          flexShrink={0}
        >
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt={item.title}
              w="full"
              h="full"
              objectFit="cover"
            />
          ) : (
            <IoImageOutline />
          )}
        </Flex>
        <Stack gap={1} minW={0}>
          <Text fontSize="xs" color="gray.500">
            {item.category}
          </Text>
          <Text fontSize="sm" fontWeight="semibold" color="gray.900">
            {item.title}
          </Text>
          <Text fontSize="xs" color="gray.600">
            Item ID: {formatItemId(item.itemId)}
          </Text>
          <Text fontSize="xs" color="gray.600">
            Found: {formatClaimDate(item.dateFound)}
            {item.locationFound ? ` · ${item.locationFound}` : ''}
          </Text>
        </Stack>
      </Grid>
    </ClaimCard>
  );
}
