'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Flex,
  Grid,
  Heading,
  SimpleGrid,
  Stack,
  Text,
  chakra,
} from '@chakra-ui/react';
import {
  IoArchiveOutline,
  IoBagHandleOutline,
  IoClipboardOutline,
  IoSearchOutline,
} from 'react-icons/io5';
import { DashboardMetricCard } from '@/components/dashboard/DashboardMetricCard';
import { ItemsByCategoryCard } from '@/components/dashboard/ItemsByCategoryCard';
import { RecentClaimsTable } from '@/components/dashboard/RecentClaimsTable';
import { fetchAllClaims } from '@/lib/api/claims';
import {
  fetchCampuses,
  fetchCategoryStats,
  fetchExpiredItemCount,
} from '@/lib/api/items';
import type { SecurityClaimListItem } from '@/types/claims';
import type { Campus, CategoryStat } from '@/types/items';
import {
  buildSecurityClaimsHref,
  buildSecurityItemsHref,
  claimAwaitingMatchConfirmation,
} from '@/utils/claimDisplay';

const Select = chakra('select');

const terminalClaimStatuses = new Set(['rejected', 'picked_up']);

function countAwaitingMatch(claims: SecurityClaimListItem[]): number {
  return claims.filter(
    (claim) =>
      claim.status === 'submitted' &&
      !claim.itemId &&
      !terminalClaimStatuses.has(claim.status)
  ).length;
}

function countReadyToApprove(claims: SecurityClaimListItem[]): number {
  return claims.filter((claim) => claimAwaitingMatchConfirmation(claim)).length;
}

function countPendingPickup(claims: SecurityClaimListItem[]): number {
  return claims.filter((claim) => claim.status === 'approved').length;
}

export default function SecurityDashboardPage() {
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [campusesLoaded, setCampusesLoaded] = useState(false);
  const [selectedCampusId, setSelectedCampusId] = useState('');
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [expiredItemCount, setExpiredItemCount] = useState(0);
  const [claims, setClaims] = useState<SecurityClaimListItem[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [claimsLoading, setClaimsLoading] = useState(true);
  const [statsError, setStatsError] = useState('');
  const [claimsError, setClaimsError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadCampuses() {
      try {
        const data = await fetchCampuses();
        if (!active) return;
        setCampuses(data);
      } catch {
        // Campus filter is optional; dashboard can still load all-campus data.
      } finally {
        if (active) setCampusesLoaded(true);
      }
    }

    loadCampuses();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!campusesLoaded) return;

    let active = true;

    async function loadCategoryStats() {
      setStatsLoading(true);
      setStatsError('');

      try {
        const [categoryData, expiredCount] = await Promise.all([
          fetchCategoryStats(selectedCampusId || undefined),
          fetchExpiredItemCount(selectedCampusId || undefined),
        ]);
        if (!active) return;
        setCategoryStats(categoryData);
        setExpiredItemCount(expiredCount);
      } catch (err) {
        if (!active) return;
        setStatsError(
          err instanceof Error ? err.message : 'Failed to load storage items.'
        );
        setCategoryStats([]);
        setExpiredItemCount(0);
      } finally {
        if (active) setStatsLoading(false);
      }
    }

    loadCategoryStats();
    return () => {
      active = false;
    };
  }, [selectedCampusId, campusesLoaded]);

  useEffect(() => {
    if (!campusesLoaded) return;

    let active = true;

    async function loadClaims() {
      setClaimsLoading(true);
      setClaimsError('');

      try {
        const data = await fetchAllClaims({
          campusId: selectedCampusId || undefined,
        });
        if (!active) return;
        setClaims(data);
      } catch (err) {
        if (!active) return;
        setClaimsError(
          err instanceof Error ? err.message : 'Failed to load claims.'
        );
        setClaims([]);
      } finally {
        if (active) setClaimsLoading(false);
      }
    }

    loadClaims();
    return () => {
      active = false;
    };
  }, [selectedCampusId, campusesLoaded]);

  const metrics = useMemo(() => {
    const awaitingMatch = countAwaitingMatch(claims);
    const readyToApprove = countReadyToApprove(claims);
    const pendingPickup = countPendingPickup(claims);
    const itemsInStorage = categoryStats.reduce(
      (sum, stat) => sum + stat.count,
      0
    );

    return {
      awaitingMatch,
      readyToApprove,
      pendingPickup,
      itemsInStorage,
      expiredItemCount,
    };
  }, [claims, categoryStats, expiredItemCount]);

  return (
    <Stack gap={8}>
      <Flex
        direction={{ base: 'column', md: 'row' }}
        justify="space-between"
        align={{ base: 'stretch', md: 'flex-end' }}
        gap={4}
      >
        <Stack gap={1}>
          <Heading
            as="h1"
            fontSize={{ base: '2xl', md: '3xl' }}
            fontWeight="bold"
            color="gray.900"
          >
            Lost &amp; Found Overview
          </Heading>
          <Text fontSize="sm" color="gray.500">
            Track claim queues and storage inventory across campuses.
          </Text>
        </Stack>

        <Stack gap={1} align={{ base: 'stretch', md: 'flex-end' }}>
          <Flex
            align="center"
            gap={3}
            bg="white"
            borderWidth="1px"
            borderColor="gray.200"
            borderRadius="md"
            px={3}
            py={2}
          >
            <chakra.label
              htmlFor="campus-select"
              fontSize="sm"
              fontWeight="medium"
              color="gray.600"
              whiteSpace="nowrap"
            >
              Campus
            </chakra.label>
            <Select
              id="campus-select"
              value={selectedCampusId}
              onChange={(e) => setSelectedCampusId(e.target.value)}
              minW="160px"
              h={9}
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
          </Flex>
        </Stack>
      </Flex>

      <SimpleGrid columns={{ base: 1, md: 4 }} gap={4}>
        <DashboardMetricCard
          title="Awaiting Match"
          value={claimsLoading ? '—' : metrics.awaitingMatch}
          subtitle="Claims"
          accentColor="purple.600"
          iconBg="purple.50"
          icon={<IoSearchOutline size={28} />}
          href={buildSecurityClaimsHref({
            status: 'awaiting_match',
            campusId: selectedCampusId || undefined,
          })}
        />
        <DashboardMetricCard
          title="Match Pending"
          value={claimsLoading ? '—' : metrics.readyToApprove}
          subtitle="Claims"
          accentColor="blue.600"
          iconBg="blue.50"
          icon={<IoClipboardOutline size={28} />}
          href={buildSecurityClaimsHref({
            status: 'match_pending',
            campusId: selectedCampusId || undefined,
          })}
        />
        <DashboardMetricCard
          title="Pending Pickup"
          value={claimsLoading ? '—' : metrics.pendingPickup}
          subtitle="Items"
          accentColor="orange.600"
          iconBg="orange.50"
          icon={<IoBagHandleOutline size={28} />}
          href={buildSecurityClaimsHref({
            status: 'ready_for_pickup',
            campusId: selectedCampusId || undefined,
          })}
        />
        <DashboardMetricCard
          title="Retention Expired"
          value={statsLoading ? '—' : metrics.expiredItemCount}
          subtitle="Items"
          accentColor="green.600"
          iconBg="green.50"
          icon={<IoArchiveOutline size={28} />}
          href={buildSecurityItemsHref({
            status: 'expired',
            campusId: selectedCampusId || undefined,
          })}
        />
      </SimpleGrid>

      <Grid
        templateColumns={{
          base: '1fr',
          lg: 'minmax(260px, 40%) minmax(0, 1fr)',
        }}
        gap={6}
        alignItems="stretch"
      >
        <ItemsByCategoryCard
          categoryStats={categoryStats}
          loading={statsLoading}
          error={statsError}
        />
        <RecentClaimsTable
          claims={claims}
          loading={claimsLoading}
          error={claimsError}
        />
      </Grid>
    </Stack>
  );
}
