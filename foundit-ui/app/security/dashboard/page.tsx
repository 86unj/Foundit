'use client';

import { useMemo, useState } from 'react';
import { Heading, Stack } from '@chakra-ui/react';
import { CampusStatusCard } from '@/components/dashboard/CampusStatusCard';
import type { ClaimCategoryStatProps } from '@/components/dashboard/ClaimCategoryStat';
import { CAMPUSES, DEFAULT_CAMPUS_ID } from '@/constants/campuses';
import { useLoggedInDisplayName } from '@/hooks/useLoggedInDisplayName';

/** Placeholder per-campus stats until dashboard API supports campusId filter. */
const MOCK_STATS_BY_CAMPUS: Record<
  string,
  { totalClaims: number; categoryStats: ClaimCategoryStatProps[] }
> = {
  newnham: {
    totalClaims: 9,
    categoryStats: [
      { category: 'Electronics', itemName: 'keyboard', count: 5 },
      { category: 'Cards', itemName: 'Student ID', count: 5 },
      { category: 'Clothing', itemName: 'hoodie', count: 2 },
      { category: 'Electronics', itemName: 'mouse', count: 2 },
      { category: 'Electronics', itemName: 'charger', count: 5 },
    ],
  },
  'seneca-york': {
    totalClaims: 4,
    categoryStats: [
      { category: 'Electronics', itemName: 'laptop', count: 2 },
      { category: 'Accessories', itemName: 'water bottle', count: 1 },
      { category: 'Cards', itemName: 'Student ID', count: 1 },
    ],
  },
  king: {
    totalClaims: 2,
    categoryStats: [
      { category: 'Clothing', itemName: 'jacket', count: 1 },
      { category: 'Electronics', itemName: 'earbuds', count: 1 },
    ],
  },
  peterborough: {
    totalClaims: 3,
    categoryStats: [
      { category: 'Electronics', itemName: 'phone', count: 2 },
      { category: 'Other', itemName: 'umbrella', count: 1 },
    ],
  },
};

export default function SecurityDashboardPage() {
  const [selectedCampusId, setSelectedCampusId] = useState(DEFAULT_CAMPUS_ID);
  const displayName = useLoggedInDisplayName();

  const campusStats = useMemo(() => {
    return (
      MOCK_STATS_BY_CAMPUS[selectedCampusId] ??
      MOCK_STATS_BY_CAMPUS[DEFAULT_CAMPUS_ID]
    );
  }, [selectedCampusId]);

  return (
    <Stack gap={8}>
      <Heading
        as="h1"
        fontSize={{ base: '2xl', md: '3xl' }}
        fontWeight="bold"
        color="blue.900"
        textAlign="center"
        w="full"
      >
        Hello, {displayName}
      </Heading>

      <CampusStatusCard
        campuses={CAMPUSES}
        selectedCampusId={selectedCampusId}
        onCampusChange={setSelectedCampusId}
        totalClaims={campusStats.totalClaims}
        categoryStats={campusStats.categoryStats}
      />
    </Stack>
  );
}
