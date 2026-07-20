'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Flex,
  Heading,
  NativeSelect,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Button } from '@/components/ui/Button';
import { useLoggedInDisplayName } from '@/hooks/useLoggedInDisplayName';
import { fetchCampuses, fetchCategoryStats } from '@/lib/api/items';
import { ApiError } from '@/lib/api/client';
import type { Campus, CategoryStat } from '@/types/items';
import { getCategoryDisplay } from '@/utils/categoryDisplay';
import { FixedPageBackground } from '@/components/PageBackground';
import { debugError } from '@/utils/debug';

export default function StudentDashboardPage() {
  const router = useRouter();
  const displayName = useLoggedInDisplayName();
  const [isNavigatingToClaim, setIsNavigatingToClaim] = useState(false);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [campusFilter, setCampusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadCampuses() {
      try {
        const data = await fetchCampuses();
        if (active) setCampuses(data);
      } catch {
        // Campus filter is optional; stats can still load for all campuses.
      }
    }

    loadCampuses();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadCategoryStats() {
      setLoading(true);
      setError('');

      try {
        const data = await fetchCategoryStats(campusFilter || undefined);
        if (!active) return;

        setCategoryStats(data);
      } catch (err) {
        debugError('student-dashboard', 'category stats fetch failed', err);
        if (!active) return;
        setError(
          err instanceof ApiError && err.status === 0
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Unable to load found items right now. Please try again later.'
        );
        setCategoryStats([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadCategoryStats();
    return () => {
      active = false;
    };
  }, [campusFilter]);

  const totalItems = useMemo(
    () => categoryStats.reduce((sum, stat) => sum + stat.count, 0),
    [categoryStats]
  );

  const storageSummary = loading
    ? 'Loading found items…'
    : `${totalItems} item${totalItems === 1 ? '' : 's'} in storage`;

  return (
    <>
      <FixedPageBackground />
      <Box
        flex={1}
        w="full"
        position="relative"
        zIndex={1}
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
                Hello{displayName ? `, ${displayName}` : ''}
              </Heading>
              <Text
                fontSize={{ base: 'sm', md: 'md' }}
                lineHeight="1.6"
                color="whiteAlpha.900"
              >
                We&apos;re here to help you recover your lost items.
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
            <Flex
              justify="space-between"
              align={{ base: 'stretch', md: 'center' }}
              direction={{ base: 'column', md: 'row' }}
              gap={{ base: 4, md: 5 }}
              mb={{ base: 5, md: 6 }}
            >
              <Stack gap={1}>
                <Heading
                  as="h2"
                  fontSize={{ base: 'lg', md: 'xl' }}
                  fontWeight="bold"
                  color="gray.900"
                >
                  Found Items Overview
                </Heading>
                {!error && (
                  <Text fontSize="sm" color="gray.500">
                    {storageSummary}
                  </Text>
                )}
              </Stack>

              <NativeSelect.Root
                w={{ base: 'full', sm: '190px' }}
                alignSelf={{ base: 'stretch', md: 'flex-start' }}
              >
                <NativeSelect.Field
                  aria-label="Filter by campus"
                  value={campusFilter}
                  onChange={(event) => setCampusFilter(event.target.value)}
                  fontSize="sm"
                >
                  <option value="">All campuses</option>
                  {campuses.map((campus) => (
                    <option key={campus.campusId} value={campus.campusId}>
                      {campus.campusName}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Flex>

            {loading ? (
              <Box
                minH="180px"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <Spinner size="lg" color="blue.500" />
              </Box>
            ) : error ? (
              <Text color="red.600" fontSize="sm" textAlign="center" py={8}>
                {error}
              </Text>
            ) : categoryStats.length === 0 ? (
              <Text color="gray.600" fontSize="sm" textAlign="center" py={8}>
                No found items in storage.
              </Text>
            ) : (
              <SimpleGrid columns={{ base: 1, md: 3 }} gap={{ base: 4, md: 5 }}>
                {categoryStats.map((stat) => {
                  const {
                    icon: Icon,
                    accentColor,
                    iconBg,
                    iconBadgeBg,
                  } = getCategoryDisplay(stat.category);

                  return (
                    <Flex
                      key={stat.category}
                      bg={iconBg}
                      borderRadius="lg"
                      px={5}
                      py={4}
                      minH="72px"
                      justify="space-between"
                      align="center"
                      gap={4}
                    >
                      <Flex align="center" gap={3} minW={0}>
                        <Flex
                          align="center"
                          justify="center"
                          w={10}
                          h={10}
                          borderRadius="md"
                          bg={iconBadgeBg}
                          color={accentColor}
                          flexShrink={0}
                          aria-hidden
                        >
                          <Icon size={20} />
                        </Flex>
                        <Text
                          fontSize="sm"
                          fontWeight="bold"
                          color={accentColor}
                          lineClamp={2}
                        >
                          {stat.category}
                        </Text>
                      </Flex>
                      <Text
                        fontSize="lg"
                        fontWeight="bold"
                        color="gray.900"
                        flexShrink={0}
                      >
                        {stat.count}
                      </Text>
                    </Flex>
                  );
                })}
              </SimpleGrid>
            )}
          </Box>
        </Stack>
      </Box>
    </>
  );
}
