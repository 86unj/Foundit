'use client';

import { useMemo } from 'react';
import {
  Badge,
  Box,
  Flex,
  Heading,
  Image,
  Spinner,
  Stack,
  Text,
} from '@chakra-ui/react';
import { IoImageOutline } from 'react-icons/io5';
import NextLink from 'next/link';
import type { SecurityClaimListItem } from '@/types/claims';
import { formatRelativeTime } from '@/utils/formatRelativeTime';
import {
  getClaimDisplayStatus,
  getClaimItemName,
  claimNeedsSecurityAction,
} from '@/utils/claimDisplay';

function getClaimThumbnailUrl(claim: SecurityClaimListItem): string | null {
  return claim.images[0]?.imageUrl ?? claim.item?.imageUrl ?? null;
}

export interface RecentClaimsTableProps {
  claims: SecurityClaimListItem[];
  loading?: boolean;
  error?: string;
}

function isActionNeeded(claim: SecurityClaimListItem): boolean {
  return claimNeedsSecurityAction(claim);
}

function compareClaimsByRecency(
  a: SecurityClaimListItem,
  b: SecurityClaimListItem
): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

const headerCellProps = {
  fontSize: 'xs',
  fontWeight: 'medium',
  color: 'gray.500',
} as const;

export function RecentClaimsTable({
  claims,
  loading = false,
  error = '',
}: RecentClaimsTableProps) {
  const actionClaims = useMemo(
    () =>
      claims.filter(isActionNeeded).sort(compareClaimsByRecency).slice(0, 5),
    [claims]
  );

  return (
    <Box
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      p={{ base: 5, md: 6 }}
      h="full"
      minW={0}
    >
      <Flex justify="space-between" align="center" gap={3} mb={5}>
        <Heading as="h2" fontSize="md" fontWeight="bold" color="gray.900">
          Recent Claims
        </Heading>
        <Text
          asChild
          fontSize="sm"
          color="blue.600"
          fontWeight="medium"
          cursor="pointer"
          _hover={{ textDecoration: 'underline' }}
        >
          <NextLink href="/security/claims">View all claims</NextLink>
        </Text>
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
      ) : actionClaims.length === 0 ? (
        <Text color="gray.600" fontSize="sm" textAlign="center" py={8}>
          No claims need action right now.
        </Text>
      ) : (
        <Box bg="white" borderRadius="md" w="full" minW={0}>
          <Stack gap={0} w="full">
            <Flex
              px={3}
              py={2}
              borderBottomWidth="1px"
              borderColor="gray.200"
              gap={2}
            >
              <Box flex="1" minW={0} {...headerCellProps}>
                Item
              </Box>
              <Box w="22%" flexShrink={0} {...headerCellProps}>
                Category
              </Box>
              <Box w="26%" flexShrink={0} {...headerCellProps}>
                Status
              </Box>
              <Box
                w="56px"
                flexShrink={0}
                textAlign="right"
                {...headerCellProps}
              >
                Claimed
              </Box>
            </Flex>

            {actionClaims.map((claim, index) => {
              const displayStatus = getClaimDisplayStatus(claim);
              const thumbnailUrl = getClaimThumbnailUrl(claim);
              const itemName = getClaimItemName(claim);
              const isLast = index === actionClaims.length - 1;

              return (
                <Flex
                  key={claim.claimId}
                  px={3}
                  py={3}
                  bg="white"
                  gap={2}
                  align="center"
                  borderBottomWidth={isLast ? 0 : '1px'}
                  borderColor="gray.200"
                  w="full"
                  minW={0}
                >
                  <Flex flex="1" minW={0} align="center" gap={2}>
                    <Box
                      w="32px"
                      h="32px"
                      borderRadius="md"
                      bg="gray.100"
                      borderWidth="1px"
                      borderColor="gray.200"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      overflow="hidden"
                      flexShrink={0}
                    >
                      {thumbnailUrl ? (
                        <Image
                          src={thumbnailUrl}
                          alt={itemName}
                          w="full"
                          h="full"
                          objectFit="cover"
                        />
                      ) : (
                        <Box color="gray.400" aria-hidden>
                          <IoImageOutline size={16} />
                        </Box>
                      )}
                    </Box>
                    <Text
                      asChild
                      fontSize="sm"
                      fontWeight="medium"
                      lineClamp={1}
                      minW={0}
                      _hover={{ textDecoration: 'underline' }}
                    >
                      <NextLink href={`/security/claims/${claim.claimId}`}>
                        {itemName}
                      </NextLink>
                    </Text>
                  </Flex>

                  <Box w="22%" flexShrink={0} minW={0}>
                    <Text fontSize="sm" color="gray.700" lineClamp={1}>
                      {claim.category}
                    </Text>
                  </Box>

                  <Box w="26%" flexShrink={0} minW={0}>
                    <Badge
                      colorPalette={displayStatus.colorPalette}
                      variant="subtle"
                      fontSize="xs"
                      maxW="full"
                      truncate
                    >
                      {displayStatus.label}
                    </Badge>
                  </Box>

                  <Box w="56px" flexShrink={0} textAlign="right">
                    <Text fontSize="xs" color="gray.500" whiteSpace="nowrap">
                      {formatRelativeTime(claim.createdAt)}
                    </Text>
                  </Box>
                </Flex>
              );
            })}
          </Stack>
        </Box>
      )}
    </Box>
  );
}
