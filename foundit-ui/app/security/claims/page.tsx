'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Input,
  Spinner,
  Stack,
  Text,
  chakra,
} from '@chakra-ui/react';
import {
  IoArrowDown,
  IoArrowUp,
  IoChevronBack,
  IoChevronForward,
  IoSearch,
  IoSwapVertical,
} from 'react-icons/io5';
import NextLink from 'next/link';
import { useSearchParams } from 'next/navigation';
import { fetchAllClaims } from '@/lib/api/claims';
import { fetchCampuses } from '@/lib/api/items';
import type { SecurityClaimListItem } from '@/types/claims';
import type { Campus } from '@/types/items';
import {
  formatClaimId,
  getClaimDisplayStatus,
  getClaimItemName,
  matchesClaimStatusFilter,
} from '@/utils/claimDisplay';

const Select = chakra('select');
const SortButton = chakra('button');
const CLAIMS_PER_PAGE = 10;

const CLAIM_STATUS_FILTERS = new Set([
  '',
  'pending',
  'awaiting_match',
  'match_pending',
  'ready_for_pickup',
  'completed',
  'rejected',
]);

function resolveStatusFilter(value: string | null): string {
  if (value === null) return 'pending';
  return CLAIM_STATUS_FILTERS.has(value) ? value : 'pending';
}

type SortField =
  | 'claimId'
  | 'studentName'
  | 'itemName'
  | 'submitted'
  | 'status';
type SortDirection = 'asc' | 'desc';

interface SortState {
  field: SortField;
  direction: SortDirection;
}

function formatSubmittedAt(value: string): { date: string; time: string } {
  const submittedAt = new Date(value);

  if (Number.isNaN(submittedAt.getTime())) {
    return { date: '—', time: '' };
  }

  return {
    date: submittedAt.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    time: submittedAt.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }),
  };
}

function getStudentName(claim: SecurityClaimListItem): string {
  return `${claim.student.firstName} ${claim.student.lastName}`;
}

function getClaimSortValue(
  claim: SecurityClaimListItem,
  field: SortField
): string | number {
  switch (field) {
    case 'claimId':
      return formatClaimId(claim.claimId);
    case 'studentName':
      return getStudentName(claim);
    case 'itemName':
      return getClaimItemName(claim);
    case 'status':
      return getClaimDisplayStatus(claim).label;
    case 'submitted':
      return new Date(claim.createdAt).getTime();
  }
}

function compareClaimSortValues(
  a: SecurityClaimListItem,
  b: SecurityClaimListItem,
  sortState: SortState
): number {
  const aValue = getClaimSortValue(a, sortState.field);
  const bValue = getClaimSortValue(b, sortState.field);

  const comparison =
    typeof aValue === 'number' && typeof bValue === 'number'
      ? aValue - bValue
      : String(aValue).localeCompare(String(bValue), undefined, {
          sensitivity: 'base',
        });

  return sortState.direction === 'asc' ? comparison : -comparison;
}

const headerCellProps = {
  fontSize: 'xs',
  fontWeight: 'semibold',
  color: 'gray.500',
  textTransform: 'none',
} as const;

function SecurityClaimsPageContent() {
  const searchParams = useSearchParams();
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [claims, setClaims] = useState<SecurityClaimListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [campusFilter, setCampusFilter] = useState(
    () => searchParams.get('campusId') ?? ''
  );
  const [statusFilter, setStatusFilter] = useState(() =>
    resolveStatusFilter(searchParams.get('status'))
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [sortState, setSortState] = useState<SortState>({
    field: 'submitted',
    direction: 'desc',
  });
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;

    async function loadCampuses() {
      try {
        const data = await fetchCampuses();
        if (active) setCampuses(data);
      } catch {
        // Campus filter is optional.
      }
    }

    loadCampuses();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadClaims() {
      setLoading(true);
      setError('');

      try {
        const data = await fetchAllClaims({
          campusId: campusFilter || undefined,
        });
        if (!active) return;
        setClaims(data);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load claims.');
        setClaims([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadClaims();
    return () => {
      active = false;
    };
  }, [campusFilter]);

  const filteredClaims = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return claims
      .filter((claim) => {
        const studentName = getStudentName(claim).toLowerCase();
        const itemName = getClaimItemName(claim).toLowerCase();
        const claimRef = formatClaimId(claim.claimId).toLowerCase();

        const matchesStatus = matchesClaimStatusFilter(claim, statusFilter);

        const matchesSearch =
          !query ||
          studentName.includes(query) ||
          claim.student.email.toLowerCase().includes(query) ||
          itemName.includes(query) ||
          claim.category.toLowerCase().includes(query) ||
          claimRef.includes(query) ||
          claim.claimId.toLowerCase().includes(query);

        return matchesStatus && matchesSearch;
      })
      .sort((a, b) => compareClaimSortValues(a, b, sortState));
  }, [claims, statusFilter, searchQuery, sortState]);

  function handleSort(field: SortField) {
    setSortState((current) => ({
      field,
      direction:
        current.field === field && current.direction === 'asc' ? 'desc' : 'asc',
    }));
    setPage(1);
  }

  function renderSortIcon(field: SortField) {
    if (sortState.field !== field) return <IoSwapVertical size={14} />;
    return sortState.direction === 'asc' ? (
      <IoArrowUp size={14} />
    ) : (
      <IoArrowDown size={14} />
    );
  }

  function renderSortableHeader(label: string, field: SortField) {
    const isActive = sortState.field === field;

    return (
      <SortButton
        type="button"
        display="inline-flex"
        alignItems="center"
        gap={1}
        p={0}
        bg="transparent"
        borderWidth={0}
        color={isActive ? 'gray.900' : 'gray.500'}
        fontSize="xs"
        fontWeight="semibold"
        lineHeight="1"
        textAlign="left"
        cursor="pointer"
        onClick={() => handleSort(field)}
        _hover={{ color: 'gray.900' }}
      >
        <Text as="span">{label}</Text>
        <Box color={isActive ? 'blue.600' : 'gray.400'} aria-hidden>
          {renderSortIcon(field)}
        </Box>
      </SortButton>
    );
  }

  const totalPages = Math.max(
    1,
    Math.ceil(filteredClaims.length / CLAIMS_PER_PAGE)
  );
  const currentPage = Math.min(page, totalPages);
  const pageStartIndex = (currentPage - 1) * CLAIMS_PER_PAGE;
  const visibleClaims = filteredClaims.slice(
    pageStartIndex,
    pageStartIndex + CLAIMS_PER_PAGE
  );
  const resultStart = filteredClaims.length === 0 ? 0 : pageStartIndex + 1;
  const resultEnd = Math.min(
    pageStartIndex + visibleClaims.length,
    filteredClaims.length
  );
  const pageNumbers = Array.from(
    { length: totalPages },
    (_, index) => index + 1
  );

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Heading
          as="h1"
          fontSize={{ base: '2xl', md: '3xl' }}
          fontWeight="bold"
          color="gray.900"
        >
          Claims
        </Heading>
        <Text fontSize="sm" color="gray.500">
          Review and manage student claims.
        </Text>
      </Stack>

      <Box
        bg="white"
        borderWidth="1px"
        borderColor="gray.200"
        borderRadius="lg"
        overflow="hidden"
      >
        <Flex
          p={4}
          gap={4}
          align={{ base: 'stretch', lg: 'center' }}
          direction={{ base: 'column', lg: 'row' }}
          borderBottomWidth="1px"
          borderColor="gray.200"
        >
          <Box position="relative" flex={1} minW={{ lg: '320px' }}>
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by claim ID, student name, email, or item..."
              h={10}
              pl={10}
              bg="white"
              borderColor="gray.300"
              fontSize="sm"
              _focusVisible={{
                outline: 'none',
                boxShadow: '0 0 0 2px #009adb',
              }}
            />
            <Box
              position="absolute"
              left={3}
              top="50%"
              transform="translateY(-50%)"
              color="gray.500"
              pointerEvents="none"
              aria-hidden
            >
              <IoSearch size={18} />
            </Box>
          </Box>

          <Select
            value={campusFilter}
            onChange={(e) => {
              setCampusFilter(e.target.value);
              setPage(1);
            }}
            minW={{ lg: '180px' }}
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
              boxShadow: '0 0 0 2px #009adb',
            }}
          >
            <option value="">All Campuses</option>
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
            minW={{ lg: '160px' }}
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
              boxShadow: '0 0 0 2px #009adb',
            }}
          >
            <option value="pending">Active claims</option>
            <option value="">All statuses</option>
            <option value="awaiting_match">Awaiting match</option>
            <option value="match_pending">Match pending</option>
            <option value="ready_for_pickup">Ready for pickup</option>
            <option value="completed">Completed</option>
            <option value="rejected">Closed (rejected)</option>
          </Select>
        </Flex>

        {loading ? (
          <Box py={12} display="flex" justifyContent="center">
            <Spinner size="lg" color="blue.500" />
          </Box>
        ) : error ? (
          <Text color="red.600" fontSize="sm" py={8} textAlign="center">
            {error}
          </Text>
        ) : filteredClaims.length === 0 ? (
          <Text color="gray.500" fontSize="sm" py={8} textAlign="center">
            No claims match your filters.
          </Text>
        ) : (
          <>
            <Box overflowX="auto">
              <Stack gap={0} minW="760px">
                <Flex
                  px={5}
                  py={3}
                  borderBottomWidth="1px"
                  borderColor="gray.200"
                  bg="gray.50"
                  align="center"
                  gap={4}
                >
                  <Box w="112px" flexShrink={0} {...headerCellProps}>
                    {renderSortableHeader('Claim ID', 'claimId')}
                  </Box>
                  <Box w="22%" flexShrink={0} {...headerCellProps}>
                    {renderSortableHeader('Student Name', 'studentName')}
                  </Box>
                  <Box flex="1" minW={0} {...headerCellProps}>
                    {renderSortableHeader('Claimed Item', 'itemName')}
                  </Box>
                  <Box w="150px" flexShrink={0} {...headerCellProps}>
                    {renderSortableHeader('Submitted', 'submitted')}
                  </Box>
                  <Box w="150px" flexShrink={0} {...headerCellProps}>
                    {renderSortableHeader('Status', 'status')}
                  </Box>
                </Flex>

                {visibleClaims.map((claim, index) => {
                  const displayStatus = getClaimDisplayStatus(claim);
                  const submittedAt = formatSubmittedAt(claim.createdAt);
                  const isLast = index === visibleClaims.length - 1;

                  return (
                    <Box
                      key={claim.claimId}
                      asChild
                      display="block"
                      textDecoration="none"
                      color="inherit"
                      _hover={{ bg: 'blue.50' }}
                    >
                      <NextLink href={`/security/claims/${claim.claimId}`}>
                        <Flex
                          px={5}
                          py={4}
                          align="center"
                          gap={4}
                          borderBottomWidth={isLast ? 0 : '1px'}
                          borderColor="gray.200"
                        >
                          <Box w="112px" flexShrink={0}>
                            <Text
                              fontSize="sm"
                              fontWeight="medium"
                              color="blue.700"
                            >
                              {formatClaimId(claim.claimId)}
                            </Text>
                          </Box>

                          <Box w="22%" flexShrink={0} minW={0}>
                            <Text
                              fontSize="sm"
                              fontWeight="medium"
                              color="gray.900"
                              lineClamp={1}
                            >
                              {getStudentName(claim)}
                            </Text>
                          </Box>

                          <Box flex="1" minW={0}>
                            <Text
                              fontSize="sm"
                              fontWeight="medium"
                              color="gray.900"
                              lineClamp={1}
                            >
                              {getClaimItemName(claim)}
                            </Text>
                          </Box>

                          <Box w="150px" flexShrink={0}>
                            <Text fontSize="sm" color="gray.700">
                              {submittedAt.date}
                            </Text>
                            {submittedAt.time ? (
                              <Text fontSize="xs" color="gray.500">
                                {submittedAt.time}
                              </Text>
                            ) : null}
                          </Box>

                          <Box w="150px" flexShrink={0}>
                            <Badge
                              colorPalette={displayStatus.colorPalette}
                              variant="subtle"
                              fontSize="xs"
                              fontWeight="medium"
                              px={2}
                              py={1}
                              borderRadius="full"
                            >
                              {displayStatus.label}
                            </Badge>
                          </Box>
                        </Flex>
                      </NextLink>
                    </Box>
                  );
                })}
              </Stack>
            </Box>

            <Flex
              px={5}
              py={4}
              justify="space-between"
              align={{ base: 'stretch', sm: 'center' }}
              direction={{ base: 'column', sm: 'row' }}
              gap={3}
              borderTopWidth="1px"
              borderColor="gray.200"
            >
              <Text fontSize="sm" color="gray.600">
                Showing {resultStart} to {resultEnd} of {filteredClaims.length}{' '}
                claims
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
      </Box>
    </Stack>
  );
}

export default function SecurityClaimsPage() {
  return (
    <Suspense fallback={null}>
      <SecurityClaimsPageFromUrl />
    </Suspense>
  );
}

function SecurityClaimsPageFromUrl() {
  const searchParams = useSearchParams();
  const filterKey = `${searchParams.get('status') ?? ''}|${searchParams.get('campusId') ?? ''}`;

  return <SecurityClaimsPageContent key={filterKey} />;
}
