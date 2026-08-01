'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Flex,
  Grid,
  HStack,
  Image,
  Input,
  Spinner,
  Stack,
  Text,
  chakra,
} from '@chakra-ui/react';
import { IoChevronForward, IoImageOutline, IoSearch } from 'react-icons/io5';
import NextLink from 'next/link';
import { Button } from '@/components/ui/Button';
import { fetchCategoryStats, fetchSecurityItems } from '@/lib/api/items';
import type { SecurityClaimListItem } from '@/types/claims';
import type { CategoryStat, SecurityItemListItem } from '@/types/items';
import { formatClaimDate } from '@/utils/claimDisplay';

const Select = chakra('select');
const RadioInput = chakra('input');

function formatItemId(itemId: string): string {
  return itemId.slice(0, 8).toUpperCase();
}

interface ClaimManualSearchListProps {
  claim: SecurityClaimListItem;
  selectedItemId: string | null;
  onSelectItem: (itemId: string) => void;
}

interface ManualSearchRowProps {
  item: SecurityItemListItem;
  selected: boolean;
  onSelect: () => void;
}

function ManualSearchRow({ item, selected, onSelect }: ManualSearchRowProps) {
  return (
    <Box
      borderWidth="1px"
      borderColor={selected ? 'blue.500' : 'gray.200'}
      borderRadius="lg"
      p={2}
      bg={selected ? 'blue.50' : 'white'}
      cursor="pointer"
      onClick={onSelect}
      transition="border-color 0.15s, background 0.15s"
      _hover={{ borderColor: selected ? 'blue.500' : 'gray.300' }}
    >
      <Grid templateColumns="auto 48px 1fr auto" gap={2} alignItems="center">
        <RadioInput
          type="radio"
          name="manual-item-search"
          checked={selected}
          readOnly
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          accentColor="var(--chakra-colors-blue-500)"
        />
        <Flex
          w="48px"
          h="48px"
          borderRadius="md"
          bg="gray.100"
          borderWidth="1px"
          borderColor="gray.200"
          align="center"
          justify="center"
          overflow="hidden"
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
            <Box color="gray.400" aria-hidden>
              <IoImageOutline size={20} />
            </Box>
          )}
        </Flex>
        <Stack gap={0} minW={0}>
          <Text
            fontSize="sm"
            fontWeight="semibold"
            color="gray.900"
            lineClamp={1}
          >
            {item.title}
          </Text>
          <Flex
            align="center"
            gap={2}
            fontSize="xs"
            minW={0}
            overflow="hidden"
            whiteSpace="nowrap"
          >
            <HStack gap={1.5} color="gray.600" minW={0} overflow="hidden">
              <Text as="span" color="gray.500" flexShrink={0}>
                {item.category}
              </Text>
              {item.campusName ? (
                <>
                  <Text as="span" color="gray.300" flexShrink={0}>
                    ·
                  </Text>
                  <Text as="span" truncate>
                    {item.campusName}
                  </Text>
                </>
              ) : null}
            </HStack>
            <Text as="span" color="gray.300" flexShrink={0}>
              |
            </Text>
            <Text as="span" color="gray.600" flexShrink={0}>
              Found {formatClaimDate(item.dateFound)}
            </Text>
            <Text as="span" color="gray.300" flexShrink={0}>
              |
            </Text>
            <Text as="span" color="gray.600" fontFamily="mono" flexShrink={0}>
              ID {formatItemId(item.itemId)}
            </Text>
          </Flex>
        </Stack>
        <Box flexShrink={0} onClick={(e) => e.stopPropagation()}>
          <NextLink href={`/security/items/${item.itemId}`}>
            <Flex
              as="span"
              align="center"
              gap={0.5}
              color="blue.600"
              fontSize="xs"
              fontWeight="medium"
              px={1}
              _hover={{ color: 'blue.700', textDecoration: 'underline' }}
            >
              Details
              <IoChevronForward size={12} aria-hidden />
            </Flex>
          </NextLink>
        </Box>
      </Grid>
    </Box>
  );
}

export function ClaimManualSearchList({
  claim,
  selectedItemId,
  onSelectItem,
}: ClaimManualSearchListProps) {
  const [categories, setCategories] = useState<CategoryStat[]>([]);
  const [items, setItems] = useState<SecurityItemListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState(claim.category);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadCategories() {
      try {
        const data = await fetchCategoryStats();
        if (!active) return;
        setCategories(data);
      } catch {
        if (active) setCategories([]);
      }
    }

    loadCategories();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadItems() {
      setLoading(true);
      setError('');

      try {
        const result = await fetchSecurityItems({
          category: categoryFilter.trim() || undefined,
          status: 'stored',
          limit: 20,
        });

        if (!active) return;
        setItems(result.data);
        setNextCursor(result.nextCursor);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : 'Failed to load stored items.'
        );
        setItems([]);
        setNextCursor(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadItems();
    return () => {
      active = false;
    };
  }, [categoryFilter]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return items;

    return items.filter((item) => {
      return (
        item.title.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.itemId.toLowerCase().includes(query) ||
        item.campusName.toLowerCase().includes(query)
      );
    });
  }, [items, searchQuery]);

  async function handleLoadMore() {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);
    setError('');

    try {
      const result = await fetchSecurityItems({
        category: categoryFilter.trim() || undefined,
        status: 'stored',
        cursor: nextCursor,
        limit: 20,
      });

      setItems((current) => [...current, ...result.data]);
      setNextCursor(result.nextCursor);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load more items.'
      );
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <Stack gap={4}>
      <Grid
        templateColumns={{ base: '1fr', sm: '1fr minmax(10rem, 12rem)' }}
        gap={3}
      >
        <Box position="relative">
          <Box
            position="absolute"
            left={3}
            top="50%"
            transform="translateY(-50%)"
            color="gray.400"
            pointerEvents="none"
            aria-hidden
          >
            <IoSearch size={16} />
          </Box>
          <Input
            pl={9}
            h={10}
            fontSize="sm"
            placeholder="Search items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </Box>

        <Select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          h={10}
          px={3}
          fontSize="sm"
          bg="white"
          borderWidth="1px"
          borderColor="gray.300"
          borderRadius="md"
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.category} value={category.category}>
              {category.category} ({category.count})
            </option>
          ))}
        </Select>
      </Grid>

      {loading ? (
        <Flex justify="center" py={8}>
          <Spinner size="md" color="blue.500" />
        </Flex>
      ) : error ? (
        <Text fontSize="sm" color="red.500" textAlign="center" py={4}>
          {error}
        </Text>
      ) : filteredItems.length === 0 ? (
        <Text fontSize="sm" color="gray.500" textAlign="center" py={8}>
          No stored items match your filters.
        </Text>
      ) : (
        <Stack gap={2}>
          {filteredItems.map((item) => (
            <ManualSearchRow
              key={item.itemId}
              item={item}
              selected={selectedItemId === item.itemId}
              onSelect={() => onSelectItem(item.itemId)}
            />
          ))}
        </Stack>
      )}

      {nextCursor && !loading ? (
        <Flex justify="center">
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </Button>
        </Flex>
      ) : null}
    </Stack>
  );
}
