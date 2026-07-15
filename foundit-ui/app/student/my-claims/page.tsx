'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Flex,
  Heading,
  Input,
  Spinner,
  Stack,
  Text,
  chakra,
} from '@chakra-ui/react';
import { IoSearch } from 'react-icons/io5';
import { Button } from '@/components/ui/Button';
import { ClaimCard } from '@/components/ClaimCard';
import { fetchAllClaims } from '@/lib/api/claims';
import { ClaimDetailModal } from '@/components/StudentClaimDetailModal';
import type { SecurityClaimListItem } from '@/types/claims';
import { getAccessToken } from '@/utils/auth';
import {
  getClaimCardStatus,
  getClaimItemName,
  matchesStudentClaimFilter,
} from '@/utils/claimDisplay';
import { PAGE_BACKGROUND_PROPS } from '@/constants/pageBackground';

const Select = chakra('select');

export default function StudentMyClaimsPage() {
  const router = useRouter();
  const isLoggedIn = !!getAccessToken();
  const [isNavigatingToClaim, setIsNavigatingToClaim] = useState(false);

  const [claims, setClaims] = useState<SecurityClaimListItem[]>([]);
  const [loading, setLoading] = useState(isLoggedIn);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClaim, setSelectedClaim] =
    useState<SecurityClaimListItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  function openClaimDetail(claim: SecurityClaimListItem) {
    setSelectedClaim(claim);
    setIsDetailOpen(true);
  }

  function closeClaimDetail() {
    setIsDetailOpen(false);
  }

  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }

    async function loadClaims() {
      try {
        const data = await fetchAllClaims();
        setClaims(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load your claims.'
        );
      } finally {
        setLoading(false);
      }
    }

    loadClaims();
  }, [isLoggedIn]);

  const filteredClaims = useMemo(
    () =>
      claims
        .filter((claim) =>
          matchesStudentClaimFilter(claim, statusFilter, searchQuery)
        )
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        ),
    [claims, statusFilter, searchQuery]
  );

  return (
    <Box
      flex={1}
      w="full"
      {...PAGE_BACKGROUND_PROPS}
      px={{ base: 5, md: 12 }}
      py={{ base: 8, md: 12 }}
    >
      <Stack gap={{ base: 7, md: 8 }} maxW="1100px" mx="auto">
        <Flex
          direction={{ base: 'column', md: 'row' }}
          justify="space-between"
          align={{ base: 'stretch', md: 'flex-start' }}
          gap={{ base: 5, md: 6 }}
          color="white"
          pt={{ base: 2, md: 4 }}
        >
          <Stack gap={3} textAlign="left" maxW="640px">
            <Heading
              as="h1"
              fontSize={{ base: '2xl', md: '40px' }}
              fontWeight="700"
              lineHeight={{ base: '1.3', md: '48px' }}
            >
              My Claims
            </Heading>
            <Text
              fontSize={{ base: 'sm', md: 'md' }}
              lineHeight="1.6"
              color="whiteAlpha.900"
            >
              Track your submitted claims and pickup status.
            </Text>
          </Stack>

          <Button
            variant="primary"
            size="lg"
            px={8}
            minH="52px"
            alignSelf={{ base: 'stretch', md: 'flex-start' }}
            flexShrink={0}
            fontWeight="bold"
            fontSize="md"
            borderRadius="lg"
            loading={isNavigatingToClaim}
            onClick={() => {
              setIsNavigatingToClaim(true);
              router.push('/student/claim-item');
            }}
          >
            + Claim an Item
          </Button>
        </Flex>

        <Box
          bg="white"
          borderRadius="xl"
          p={{ base: 6, md: 10 }}
          boxShadow="sm"
        >
          {isLoggedIn && !error && !loading && claims.length > 0 && (
            <Flex
              justify="flex-end"
              align={{ base: 'stretch', md: 'center' }}
              gap={{ base: 4, md: 5 }}
              mb={{ base: 5, md: 6 }}
            >
              <Flex
                gap={3}
                align={{ base: 'stretch', md: 'center' }}
                direction={{ base: 'column', sm: 'row' }}
                w={{ base: 'full', md: 'auto' }}
              >
                <Box position="relative" flex={1} minW={{ md: '240px' }}>
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by item, category, or claim ID..."
                    h={10}
                    pl={10}
                    bg="white"
                    borderColor="gray.300"
                    fontSize="sm"
                    _focusVisible={{
                      outline: 'none',
                      boxShadow: '0 0 0 2px {colors.focusRing}',
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
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  minW={{ sm: '180px' }}
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
                  <option value="active">Active claims</option>
                  <option value="all">All statuses</option>
                  <option value="in_progress">In progress</option>
                  <option value="pickup">Match found</option>
                  <option value="complete">Completed</option>
                  <option value="closed">Rejected</option>
                </Select>
              </Flex>
            </Flex>
          )}

          <Box minH="280px">
            {!isLoggedIn && (
              <Text color="red.600" textAlign="center" py={8}>
                You must be logged in as a student to view your claims.
              </Text>
            )}

            {isLoggedIn && loading && (
              <Box display="flex" justifyContent="center" py={16}>
                <Spinner size="xl" color="blue.500" />
              </Box>
            )}

            {isLoggedIn && !loading && error && (
              <Text color="red.500" textAlign="center" py={8}>
                {error}
              </Text>
            )}

            {isLoggedIn && !loading && !error && claims.length === 0 && (
              <Stack align="center" gap={4} py={10}>
                <Text color="gray.600" textAlign="center">
                  You don&apos;t have any claims yet.
                </Text>
                <Button
                  variant="primary"
                  fontWeight="semibold"
                  onClick={() => router.push('/student/claim-item')}
                >
                  Claim an Item
                </Button>
              </Stack>
            )}

            {isLoggedIn &&
              !loading &&
              !error &&
              claims.length > 0 &&
              filteredClaims.length === 0 && (
                <Text color="gray.500" textAlign="center" py={8}>
                  No claims match your filters.
                </Text>
              )}

            {isLoggedIn && !loading && !error && filteredClaims.length > 0 && (
              <Stack gap={3}>
                {filteredClaims.map((claim) => {
                  const { label } = getClaimCardStatus(claim);
                  const itemName = getClaimItemName(claim);
                  const category = claim.item?.category ?? claim.category;
                  return (
                    <Box
                      key={claim.claimId}
                      role="button"
                      tabIndex={0}
                      w="full"
                      textAlign="left"
                      cursor="pointer"
                      borderRadius="md"
                      aria-label={`${itemName}, ${category}, ${label}`}
                      onClick={() => openClaimDetail(claim)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openClaimDetail(claim);
                        }
                      }}
                      _focusVisible={{
                        outline: 'none',
                        boxShadow: '0 0 0 2px {colors.focusRing}',
                      }}
                    >
                      <ClaimCard claim={claim} />
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Box>
        </Box>
      </Stack>

      <ClaimDetailModal
        claim={selectedClaim}
        isOpen={isDetailOpen}
        onClose={closeClaimDetail}
        onCancelled={(claimId) => {
          setClaims((prev) => prev.filter((c) => c.claimId !== claimId));
          closeClaimDetail();
        }}
      />
    </Box>
  );
}
