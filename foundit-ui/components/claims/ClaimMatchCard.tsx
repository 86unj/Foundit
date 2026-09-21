'use client';

import {
  Badge,
  Box,
  Flex,
  Grid,
  Image,
  Stack,
  Text,
  chakra,
} from '@chakra-ui/react';
import { IoImageOutline } from 'react-icons/io5';
import type { MatchSuggestion } from '@/types/claims';
import { formatClaimDate } from '@/utils/claimDisplay';

const RadioInput = chakra('input');

function formatItemId(itemId: string): string {
  return itemId.slice(0, 8).toUpperCase();
}

function itemDetailLine(item: MatchSuggestion['item']): string | null {
  const parts = [item.brand, item.color].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

interface ClaimMatchCardProps {
  match: MatchSuggestion;
  rank: number;
  isBestMatch: boolean;
  selected: boolean;
  onSelect: () => void;
}

export function ClaimMatchCard({
  match,
  rank,
  isBestMatch,
  selected,
  onSelect,
}: ClaimMatchCardProps) {
  const { item } = match;
  const scoreLabel = `${Math.round(match.matchScore)}% Match`;
  const detailLine = itemDetailLine(item);
  const description = item.descriptionPublic?.trim();

  return (
    <Box
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      borderWidth="2px"
      borderColor={selected ? 'blue.500' : 'gray.200'}
      borderRadius="lg"
      p={4}
      bg={selected ? 'blue.50' : 'white'}
      cursor="pointer"
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      transition="border-color 0.15s, background 0.15s"
      _hover={{ borderColor: selected ? 'blue.500' : 'gray.300' }}
    >
      <Flex justify="space-between" align="center" mb={3} gap={2}>
        <Flex align="center" gap={2}>
          <Text fontSize="sm" fontWeight="bold" color="gray.700">
            {rank}
          </Text>
          {isBestMatch ? (
            <Badge colorPalette="green" variant="subtle" fontSize="xs">
              Best Match
            </Badge>
          ) : null}
          {item.status === 'expired' ? (
            <Badge colorPalette="gray" variant="subtle" fontSize="xs">
              Expired
            </Badge>
          ) : null}
        </Flex>
        <Flex align="center" gap={2}>
          <Text fontSize="xs" fontWeight="semibold" color="blue.600">
            {scoreLabel}
          </Text>
          <RadioInput
            type="radio"
            name="claim-match"
            checked={selected}
            readOnly
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
            }}
            accentColor="var(--chakra-colors-blue-500)"
          />
        </Flex>
      </Flex>

      <Grid templateColumns="88px 1fr" gap={3} alignItems="start">
        <Flex
          w="88px"
          h="88px"
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
        <Stack gap={1.5} minW={0}>
          <Text fontSize="xs" color="gray.500">
            {item.category}
          </Text>
          <Text
            fontSize="sm"
            fontWeight="semibold"
            color="gray.900"
            lineClamp={2}
          >
            {item.title}
          </Text>
          {detailLine ? (
            <Text fontSize="xs" color="gray.600">
              {detailLine}
            </Text>
          ) : null}
          {description ? (
            <Text fontSize="xs" color="gray.500" lineClamp={2}>
              {description}
            </Text>
          ) : null}
          <Text fontSize="xs" color="gray.600">
            Item ID: {formatItemId(item.itemId)}
          </Text>
          <Text fontSize="xs" color="gray.600">
            Found: {formatClaimDate(item.dateFound)}
            {item.locationFound ? ` · ${item.locationFound}` : ''}
          </Text>
        </Stack>
      </Grid>
    </Box>
  );
}
