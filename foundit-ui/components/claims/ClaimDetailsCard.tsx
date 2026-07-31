'use client';

import { Grid, Heading, Separator, Stack } from '@chakra-ui/react';
import { DetailImageGallery } from '@/components/DetailImageGallery';
import type { SecurityClaimDetail } from '@/types/claims';
import { formatClaimDate, getClaimItemName } from '@/utils/claimDisplay';
import { ClaimCard } from './ClaimCard';
import { ClaimDetailField } from './ClaimDetailField';

interface ClaimDetailsCardProps {
  claim: SecurityClaimDetail;
}

export function ClaimDetailsCard({ claim }: ClaimDetailsCardProps) {
  const studentName = `${claim.student.firstName} ${claim.student.lastName}`;
  const itemName = getClaimItemName(claim);
  const hasImages = claim.images.length > 0;

  return (
    <ClaimCard>
      <Heading as="h2" fontSize="lg" fontWeight="bold" color="gray.900" mb={4}>
        Claim Details
      </Heading>

      <Stack gap={5}>
        <Grid templateColumns={{ base: '1fr', sm: '1fr 1fr' }} gap={4}>
          <ClaimDetailField label="Name" value={studentName} />
          <ClaimDetailField
            label="Student ID"
            value={
              claim.student.studentNumber != null
                ? String(claim.student.studentNumber)
                : '—'
            }
          />
          <ClaimDetailField label="Email" value={claim.student.email} />
        </Grid>

        <Separator borderColor="gray.200" />

        {hasImages ? (
          <DetailImageGallery images={claim.images} alt={itemName} compact />
        ) : null}

        <Grid templateColumns={{ base: '1fr', sm: '1fr 1fr' }} gap={4}>
          <ClaimDetailField label="Category" value={claim.category} />
          <ClaimDetailField label="Item Name" value={itemName} />
          <ClaimDetailField
            label="Date Lost"
            value={formatClaimDate(claim.dateLost)}
          />
          <ClaimDetailField
            label="Location Lost"
            value={claim.locationLost ?? '—'}
          />
        </Grid>

        <ClaimDetailField
          label="Description"
          value={claim.description}
          wordBreak
        />

        <ClaimDetailField
          label="Additional Information"
          value={claim.additionalInfo?.trim() || '—'}
          wordBreak
        />
      </Stack>
    </ClaimCard>
  );
}
