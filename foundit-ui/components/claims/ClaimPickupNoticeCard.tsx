'use client';

import { Badge, Flex, Heading, Stack, Text } from '@chakra-ui/react';
import type { SecurityClaimDetail } from '@/types/claims';
import { formatClaimDateTime } from '@/utils/claimDisplay';
import { ClaimCard } from './ClaimCard';

interface ClaimPickupNoticeCardProps {
  claim: SecurityClaimDetail;
  campusName: string;
}

export function ClaimPickupNoticeCard({
  claim,
  campusName,
}: ClaimPickupNoticeCardProps) {
  const isPickedUp = claim.status === 'picked_up';
  const isApproved = claim.status === 'approved';

  const badgeLabel = isPickedUp
    ? 'Complete'
    : isApproved
      ? 'Notified'
      : 'Pending';

  const badgePalette = isPickedUp ? 'green' : isApproved ? 'blue' : 'gray';

  const releaserName = claim.verifier
    ? `${claim.verifier.firstName} ${claim.verifier.lastName}`.trim()
    : null;

  return (
    <ClaimCard>
      <Flex justify="space-between" align="start" mb={3} gap={2}>
        <Heading as="h2" fontSize="lg" fontWeight="bold" color="gray.900">
          Pickup Notice
        </Heading>
        <Badge colorPalette={badgePalette} variant="subtle">
          {badgeLabel}
        </Badge>
      </Flex>
      <Stack gap={3}>
        {isPickedUp ? (
          <Stack gap={1}>
            <Text fontSize="sm" color="gray.600">
              Item released on {formatClaimDateTime(claim.pickedUpAt)}.
            </Text>
            {releaserName ? (
              <Text fontSize="sm" color="gray.700">
                <Text as="span" fontWeight="semibold">
                  Released by:
                </Text>{' '}
                {releaserName}
              </Text>
            ) : null}
          </Stack>
        ) : isApproved ? (
          <>
            <Text fontSize="sm" color="gray.600">
              Student notified to pick up in person at the {campusName} campus
              security office. Approved claims expire automatically after 35
              days if the item is not collected.
            </Text>
            <Text fontSize="sm" color="gray.700">
              <Text as="span" fontWeight="semibold">
                Pickup campus:
              </Text>{' '}
              {campusName}
            </Text>
            {claim.reviewedAt ? (
              <Text fontSize="xs" color="gray.500">
                Notified on {formatClaimDateTime(claim.reviewedAt)}
              </Text>
            ) : null}
          </>
        ) : (
          <Text fontSize="sm" color="gray.600">
            Student will be notified to pick up in person after the match is
            confirmed.
          </Text>
        )}
      </Stack>
    </ClaimCard>
  );
}
