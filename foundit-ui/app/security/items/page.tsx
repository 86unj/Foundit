'use client';

import { Suspense, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  Flex,
  Heading,
  Input,
  Portal,
  Spinner,
  Stack,
  Text,
  chakra,
} from '@chakra-ui/react';
import { IoChevronBack, IoChevronForward, IoSearch } from 'react-icons/io5';
import NextLink from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button as PrimaryButton } from '@/components/ui/Button';
import { StoredItemCard } from '@/components/items/StoredItemCard';
import {
  fetchAllSecurityItems,
  fetchCampuses,
  updateSecurityItemStatus,
} from '@/lib/api/items';
import type { Campus, ItemStatus, SecurityItemListItem } from '@/types/items';
import { ITEM_STATUS_LABELS } from '@/types/items';

const Select = chakra('select');
const ITEMS_PER_PAGE = 10;

const ITEM_STATUSES: ItemStatus[] = [
  'stored',
  'claimed',
  'expired',
  'disposed',
];

const DISPOSABLE_STATUSES = new Set<ItemStatus>([
  'pending_report',
  'stored',
  'expired',
]);

function isDisposable(item: SecurityItemListItem): boolean {
  return DISPOSABLE_STATUSES.has(item.status);
}

function resolveItemStatusFilter(value: string | null): string {
  if (!value) return '';
  return ITEM_STATUSES.includes(value as ItemStatus) ? value : '';
}

function StoredItemsPageContent() {
  const searchParams = useSearchParams();
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [items, setItems] = useState<SecurityItemListItem[]>([]);
  const [campusFilter, setCampusFilter] = useState(
    () => searchParams.get('campusId') ?? ''
  );
  const [statusFilter, setStatusFilter] = useState(() =>
    resolveItemStatusFilter(searchParams.get('status'))
  );
  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get('q') ?? ''
  );
  const [debouncedQuery, setDebouncedQuery] = useState(
    () => searchParams.get('q')?.trim() ?? ''
  );
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [disposeDialogOpen, setDisposeDialogOpen] = useState(false);
  const [disposing, setDisposing] = useState(false);
  const [disposeError, setDisposeError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    let active = true;

    async function loadCampuses() {
      try {
        const data = await fetchCampuses();
        if (active) setCampuses(data);
      } catch {
        // Campus filter is optional; list can still load.
      }
    }

    loadCampuses();
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
        const data = await fetchAllSecurityItems({
          campusId: campusFilter || undefined,
          status: (statusFilter as ItemStatus) || undefined,
          q: debouncedQuery || undefined,
        });

        if (!active) return;
        setItems(data);
        setSelectedIds(new Set());
        setSelectionMode(false);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : 'Failed to load stored items.'
        );
        setItems([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadItems();
    return () => {
      active = false;
    };
  }, [campusFilter, statusFilter, debouncedQuery]);

  const filteredItems = items;

  const totalPages = Math.max(
    1,
    Math.ceil(filteredItems.length / ITEMS_PER_PAGE)
  );
  const currentPage = Math.min(page, totalPages);
  const pageStartIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const visibleItems = filteredItems.slice(
    pageStartIndex,
    pageStartIndex + ITEMS_PER_PAGE
  );
  const resultStart = filteredItems.length === 0 ? 0 : pageStartIndex + 1;
  const resultEnd = Math.min(
    pageStartIndex + visibleItems.length,
    filteredItems.length
  );
  const pageNumbers = Array.from(
    { length: totalPages },
    (_, index) => index + 1
  );

  const disposableVisibleIds = visibleItems
    .filter(isDisposable)
    .map((item) => item.itemId);
  const hasDisposableItems = filteredItems.some(isDisposable);
  const allVisibleDisposableSelected =
    disposableVisibleIds.length > 0 &&
    disposableVisibleIds.every((id) => selectedIds.has(id));
  const selectedDisposableItems = items.filter(
    (item) => selectedIds.has(item.itemId) && isDisposable(item)
  );

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function toggleItemSelection(itemId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(itemId);
      } else {
        next.delete(itemId);
      }
      return next;
    });
  }

  function toggleSelectAllVisible(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const itemId of disposableVisibleIds) {
        if (checked) {
          next.add(itemId);
        } else {
          next.delete(itemId);
        }
      }
      return next;
    });
  }

  async function handleBulkDispose() {
    if (disposing || selectedDisposableItems.length === 0) return;

    setDisposing(true);
    setDisposeError('');

    const results = await Promise.allSettled(
      selectedDisposableItems.map((item) =>
        updateSecurityItemStatus(item.itemId, { status: 'disposed' })
      )
    );

    const failedCount = results.filter((r) => r.status === 'rejected').length;
    const succeededIds = selectedDisposableItems
      .filter((_, index) => results[index].status === 'fulfilled')
      .map((item) => item.itemId);

    if (succeededIds.length > 0) {
      setItems((current) =>
        current.map((item) =>
          succeededIds.includes(item.itemId)
            ? { ...item, status: 'disposed' as ItemStatus }
            : item
        )
      );
      setSelectedIds((current) => {
        const next = new Set(current);
        for (const id of succeededIds) next.delete(id);
        return next;
      });
    }

    if (failedCount > 0) {
      setDisposeError(
        failedCount === selectedDisposableItems.length
          ? 'Failed to mark selected items as disposed.'
          : `${failedCount} of ${selectedDisposableItems.length} items could not be disposed.`
      );
      setDisposing(false);
      return;
    }

    setDisposeDialogOpen(false);
    setSelectionMode(false);
    setDisposing(false);
  }

  return (
    <Stack gap={6}>
      <Flex
        justify="space-between"
        align={{ base: 'flex-start', md: 'center' }}
        direction={{ base: 'column', md: 'row' }}
        gap={4}
      >
        <Stack gap={2}>
          <Heading
            as="h1"
            fontSize={{ base: '2xl', md: '3xl' }}
            fontWeight="bold"
            color="gray.900"
          >
            Stored Items
          </Heading>
          <Text fontSize="sm" color="gray.500">
            Please note that lost items will be stored for 30 days only.
            Unclaimed items will be disposed of after this period.
          </Text>
        </Stack>
        <PrimaryButton
          asChild
          variant="primary"
          fontWeight="semibold"
          flexShrink={0}
        >
          <NextLink href="/security/report-found">+ Add Found Item</NextLink>
        </PrimaryButton>
      </Flex>

      <Flex
        direction={{ base: 'column', sm: 'row' }}
        gap={4}
        align={{ base: 'stretch', sm: 'center' }}
        flexWrap="wrap"
      >
        <Select
          value={campusFilter}
          onChange={(e) => {
            setCampusFilter(e.target.value);
            setPage(1);
          }}
          minW={{ sm: '200px' }}
          maxW={{ sm: '240px' }}
          h={10}
          px={3}
          fontSize="sm"
          bg="white"
          borderWidth="1px"
          borderColor="gray.300"
          borderRadius="md"
          color="gray.800"
          _focusVisible={{
            outline: 'none',
            boxShadow: '0 0 0 2px {colors.focusRing}',
          }}
        >
          <option value="">All campuses</option>
          {campuses.map((campus) => (
            <option key={campus.campusId} value={campus.campusId}>
              {campus.campusName}
            </option>
          ))}
        </Select>

        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          minW={{ sm: '200px' }}
          maxW={{ sm: '240px' }}
          h={10}
          px={3}
          fontSize="sm"
          bg="white"
          borderWidth="1px"
          borderColor="gray.300"
          borderRadius="md"
          color="gray.800"
          _focusVisible={{
            outline: 'none',
            boxShadow: '0 0 0 2px {colors.focusRing}',
          }}
        >
          <option value="">Active items</option>
          {ITEM_STATUSES.map((status) => (
            <option key={status} value={status}>
              {ITEM_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>

        <Box position="relative" flex={1} maxW={{ sm: '360px' }}>
          <Input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search title, brand, color, location..."
            h={10}
            pr={10}
            bg="white"
            borderColor="gray.300"
            _focusVisible={{
              outline: 'none',
              boxShadow: '0 0 0 2px {colors.focusRing}',
            }}
          />
          <Box
            position="absolute"
            right={3}
            top="50%"
            transform="translateY(-50%)"
            color="gray.500"
            pointerEvents="none"
            aria-hidden
          >
            <IoSearch size={18} />
          </Box>
        </Box>

        {!selectionMode && hasDisposableItems && !loading ? (
          <Button
            variant="outline"
            size="sm"
            h={10}
            px={4}
            fontSize="sm"
            borderColor="gray.300"
            color="gray.700"
            flexShrink={0}
            onClick={() => setSelectionMode(true)}
          >
            Select for disposal
          </Button>
        ) : null}
      </Flex>

      {selectionMode && (
        <Flex
          align="center"
          justify="space-between"
          gap={3}
          px={4}
          py={3}
          bg="blue.50"
          borderWidth="1px"
          borderColor="blue.200"
          borderRadius="lg"
          flexWrap="wrap"
        >
          <Text fontSize="sm" fontWeight="medium" color="blue.800">
            {selectedDisposableItems.length > 0
              ? `${selectedDisposableItems.length} item${selectedDisposableItems.length === 1 ? '' : 's'} selected`
              : 'Select items to mark as disposed'}
          </Text>
          <Flex gap={2}>
            <Button variant="outline" size="sm" onClick={exitSelectionMode}>
              Cancel
            </Button>
            <Button
              colorPalette="red"
              size="sm"
              disabled={selectedDisposableItems.length === 0}
              onClick={() => {
                setDisposeError('');
                setDisposeDialogOpen(true);
              }}
            >
              Mark as disposed
            </Button>
          </Flex>
        </Flex>
      )}

      {loading && (
        <Flex justify="center" py={12}>
          <Spinner size="lg" color="blue.500" />
        </Flex>
      )}

      {!loading && error && (
        <Text color="red.500" fontSize="sm" py={4} textAlign="center">
          {error}
        </Text>
      )}

      {!loading && !error && filteredItems.length === 0 && (
        <Text color="gray.500" fontSize="sm" py={8} textAlign="center">
          No items match your filters.
        </Text>
      )}

      {!loading && !error && filteredItems.length > 0 && (
        <>
          {selectionMode && disposableVisibleIds.length > 0 && (
            <Flex align="center" gap={3}>
              <Checkbox.Root
                checked={allVisibleDisposableSelected}
                onCheckedChange={(e) =>
                  toggleSelectAllVisible(Boolean(e.checked))
                }
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control />
                <Checkbox.Label fontSize="sm" color="gray.700">
                  Select all on this page
                </Checkbox.Label>
              </Checkbox.Root>
            </Flex>
          )}

          <Stack gap={3}>
            {visibleItems.map((item) => {
              const showCheckbox = selectionMode && isDisposable(item);

              if (!showCheckbox) {
                return (
                  <Box
                    key={item.itemId}
                    asChild
                    cursor="pointer"
                    transition="transform 0.15s"
                    _hover={{ transform: 'translateY(-1px)' }}
                  >
                    <NextLink href={`/security/items/${item.itemId}`}>
                      <StoredItemCard item={item} />
                    </NextLink>
                  </Box>
                );
              }

              return (
                <Flex key={item.itemId} align="center" gap={3}>
                  <Checkbox.Root
                    checked={selectedIds.has(item.itemId)}
                    onCheckedChange={(e) =>
                      toggleItemSelection(item.itemId, Boolean(e.checked))
                    }
                    flexShrink={0}
                  >
                    <Checkbox.HiddenInput />
                    <Checkbox.Control />
                  </Checkbox.Root>
                  <Box
                    asChild
                    flex={1}
                    minW={0}
                    cursor="pointer"
                    transition="transform 0.15s"
                    _hover={{ transform: 'translateY(-1px)' }}
                  >
                    <NextLink href={`/security/items/${item.itemId}`}>
                      <StoredItemCard item={item} />
                    </NextLink>
                  </Box>
                </Flex>
              );
            })}
          </Stack>

          <Flex
            justify="space-between"
            align={{ base: 'stretch', sm: 'center' }}
            direction={{ base: 'column', sm: 'row' }}
            gap={3}
            pt={2}
          >
            <Text fontSize="sm" color="gray.600">
              Showing {resultStart} to {resultEnd} of {filteredItems.length}{' '}
              items
            </Text>
            <Flex gap={2} justify={{ base: 'flex-start', sm: 'flex-end' }}>
              <Button
                variant="outline"
                size="sm"
                w={8}
                h={8}
                minW={8}
                px={0}
                borderColor="gray.200"
                color="gray.500"
                disabled={currentPage === 1}
                aria-label="Previous page"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <IoChevronBack size={16} />
              </Button>
              {pageNumbers.map((pageNumber) => {
                const isActive = pageNumber === currentPage;

                return (
                  <Button
                    key={pageNumber}
                    variant={isActive ? 'solid' : 'outline'}
                    size="sm"
                    w={8}
                    h={8}
                    minW={8}
                    px={0}
                    bg={isActive ? 'blue.500' : 'white'}
                    color={isActive ? 'white' : 'gray.600'}
                    borderColor={isActive ? 'blue.500' : 'gray.200'}
                    fontSize="sm"
                    fontWeight="medium"
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setPage(pageNumber)}
                    _hover={{
                      bg: isActive ? 'blue.600' : 'gray.50',
                    }}
                  >
                    {pageNumber}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                w={8}
                h={8}
                minW={8}
                px={0}
                borderColor="gray.200"
                color="gray.500"
                disabled={currentPage === totalPages}
                aria-label="Next page"
                onClick={() =>
                  setPage((value) => Math.min(totalPages, value + 1))
                }
              >
                <IoChevronForward size={16} />
              </Button>
            </Flex>
          </Flex>
        </>
      )}

      <Dialog.Root
        open={disposeDialogOpen}
        onOpenChange={(e) => {
          if (!e.open && !disposing) {
            setDisposeDialogOpen(false);
            setDisposeError('');
          }
        }}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content maxW="md">
              <Dialog.Header>
                <Dialog.Title>
                  Mark {selectedDisposableItems.length} item
                  {selectedDisposableItems.length === 1 ? '' : 's'} as disposed?
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <Stack gap={3}>
                  <Text fontSize="sm" color="gray.700">
                    Confirm that the selected items have been physically
                    disposed of. This updates their status and cannot be undone.
                  </Text>
                  {disposeError ? (
                    <Text fontSize="sm" color="red.500">
                      {disposeError}
                    </Text>
                  ) : null}
                </Stack>
              </Dialog.Body>
              <Dialog.Footer>
                <Button
                  variant="outline"
                  onClick={() => setDisposeDialogOpen(false)}
                  disabled={disposing}
                >
                  Cancel
                </Button>
                <Button
                  colorPalette="red"
                  loading={disposing}
                  loadingText="Disposing..."
                  onClick={handleBulkDispose}
                  disabled={disposing}
                >
                  Confirm disposal
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </Stack>
  );
}

export default function StoredItemsPage() {
  return (
    <Suspense fallback={null}>
      <StoredItemsPageFromUrl />
    </Suspense>
  );
}

function StoredItemsPageFromUrl() {
  const searchParams = useSearchParams();
  const filterKey = `${searchParams.get('status') ?? ''}|${searchParams.get('campusId') ?? ''}|${searchParams.get('q') ?? ''}`;

  return <StoredItemsPageContent key={filterKey} />;
}
