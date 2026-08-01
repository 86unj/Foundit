'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Flex, Grid, Spinner, Stack, Text } from '@chakra-ui/react';
import { notFound } from 'next/navigation';
import { ClaimPickupNoticeCard } from '@/components/claims/ClaimPickupNoticeCard';
import { CloseClaimDialog } from '@/components/claims/CloseClaimDialog';
import { CloseClaimButton } from '@/components/claims/CloseClaimButton';
import { ClaimDetailsCard } from '@/components/claims/ClaimDetailsCard';
import { ClaimDetailHeader } from '@/components/claims/ClaimDetailHeader';
import { ClaimMatchPanel } from '@/components/claims/ClaimMatchPanel';
import { ClaimMatchedItemCard } from '@/components/claims/ClaimMatchedItemCard';
import { ClaimReleaseCard } from '@/components/claims/ClaimReleaseCard';
import { ClaimStatusStepper } from '@/components/claims/ClaimStatusStepper';
import {
  ClaimVerificationChecklist,
  isVerificationComplete,
  type VerificationState,
} from '@/components/claims/ClaimVerificationChecklist';
import { Button } from '@/components/ui/Button';
import {
  fetchClaimById,
  fetchMatchSuggestions,
  generateMatchSuggestions,
  linkClaimItem,
  updateClaimStatus,
} from '@/lib/api/claims';
import type { MatchSuggestion, SecurityClaimDetail } from '@/types/claims';
import {
  claimCanBeClosedBySecurity,
  claimHasLinkedItem,
  formatClaimDateTime,
  getClaimDetailMode,
  getClaimDisplayStatus,
  getClaimWorkflowSteps,
} from '@/utils/claimDisplay';

function claimNeedsAutoMatch(claim: SecurityClaimDetail): boolean {
  if (claim.itemId) return false;
  return claim.status === 'submitted' || claim.status === 'under_review';
}

const initialVerification: VerificationState = {
  verifyStudentId: false,
  proofOfOwnership: false,
  studentConfirmation: false,
  notes: '',
};

const backButtonStyles = {
  minW: '130px',
  h: 10,
  fontWeight: 'semibold',
  fontSize: 'sm',
} as const;

export default function ClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: claimId } = use(params);
  const router = useRouter();
  const [claim, setClaim] = useState<SecurityClaimDetail | null>(null);
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFoundState, setNotFoundState] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [generatingMatches, setGeneratingMatches] = useState(false);
  const [confirmingMatch, setConfirmingMatch] = useState(false);
  const [matchError, setMatchError] = useState('');
  const [verification, setVerification] =
    useState<VerificationState>(initialVerification);
  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState('');
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadMatches(
      claimData: SecurityClaimDetail
    ): Promise<MatchSuggestion[]> {
      if (!claimNeedsAutoMatch(claimData)) {
        return fetchMatchSuggestions(claimId).catch(
          () => [] as MatchSuggestion[]
        );
      }

      setGeneratingMatches(true);
      try {
        return await generateMatchSuggestions(claimId);
      } catch {
        return fetchMatchSuggestions(claimId).catch(
          () => [] as MatchSuggestion[]
        );
      } finally {
        if (active) setGeneratingMatches(false);
      }
    }

    async function load() {
      setLoading(true);
      setError('');

      try {
        const claimData = await fetchClaimById(claimId);

        if (!active) return;

        const matchData = await loadMatches(claimData);

        let resolvedClaim = claimData;
        if (claimNeedsAutoMatch(claimData)) {
          // Status may move submitted <-> under_review depending on whether
          // any suggestions qualified — always reload after generation.
          resolvedClaim = await fetchClaimById(claimId).catch(() => claimData);
        }

        if (!active) return;
        setClaim(resolvedClaim);
        setSuggestions(matchData);
        if (matchData.length > 0) {
          setSelectedItemId(matchData[0].itemId);
        }
      } catch (err) {
        if (!active) return;
        const message =
          err instanceof Error ? err.message : 'Failed to load claim.';
        if (message.toLowerCase().includes('not found')) {
          setNotFoundState(true);
        } else {
          setError(message);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [claimId]);

  useEffect(() => {
    if (!claim || !claimNeedsAutoMatch(claim)) return;

    let active = true;

    async function refreshMatchesOnFocus() {
      if (document.visibilityState !== 'visible' || !active) return;

      try {
        const matchData = await fetchMatchSuggestions(claimId);
        if (!active) return;
        setSuggestions(matchData);
        if (matchData.length > 0) {
          setSelectedItemId((current) => current ?? matchData[0].itemId);
        }
      } catch {
        // Keep existing suggestions when refresh fails.
      }
    }

    function handleVisibilityChange() {
      void refreshMatchesOnFocus();
    }

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        void refreshMatchesOnFocus();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('popstate', handleVisibilityChange);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('popstate', handleVisibilityChange);
    };
  }, [claim, claimId]);

  const mode = useMemo(
    () => (claim ? getClaimDetailMode(claim, suggestions.length) : 'awaiting'),
    [claim, suggestions.length]
  );

  const displayStatus = useMemo(
    () => (claim ? getClaimDisplayStatus(claim) : null),
    [claim]
  );

  const workflowSteps = useMemo(
    () => (claim ? getClaimWorkflowSteps(claim, suggestions.length) : []),
    [claim, suggestions.length]
  );

  if (notFoundState) {
    notFound();
  }

  if (loading) {
    return (
      <Box py={16} display="flex" justifyContent="center">
        <Spinner size="lg" color="blue.500" />
      </Box>
    );
  }

  if (error || !claim || !displayStatus) {
    return (
      <Stack gap={4} py={12} align="center">
        <Text color="red.500" fontSize="md">
          {error || 'Failed to load claim.'}
        </Text>
        <Button
          {...backButtonStyles}
          variant="muted"
          onClick={() => router.push('/security/claims')}
        >
          Back to List
        </Button>
      </Stack>
    );
  }

  const pickupCampusName = claim.item?.campus.campusName ?? '—';

  const headerSubtitle = claim.reviewedAt
    ? claimHasLinkedItem(claim) || claim.status === 'approved'
      ? `Match confirmed on ${formatClaimDateTime(claim.reviewedAt)}`
      : undefined
    : undefined;

  const matchPanelVariant = mode === 'review' ? 'review' : 'awaiting';
  const showMatchingLayout = mode === 'awaiting' || mode === 'review';
  const showWorkflowSidebar = mode === 'post_match' || mode === 'terminal';
  const verificationComplete = isVerificationComplete(verification);
  const canRelease = verificationComplete && claim.status === 'approved';
  const releaseDisabledReason =
    claim.status !== 'approved'
      ? 'Claim must be approved before release'
      : !verificationComplete
        ? 'Complete all verification checklist items first'
        : undefined;
  const canCloseClaim = claimCanBeClosedBySecurity(claim);

  async function handleConfirmMatch() {
    if (!claim || !selectedItemId) return;

    setConfirmingMatch(true);
    setMatchError('');

    try {
      const updated = await linkClaimItem(claim.claimId, selectedItemId);
      setClaim(updated);
    } catch (err) {
      setMatchError(
        err instanceof Error ? err.message : 'Failed to confirm match.'
      );
    } finally {
      setConfirmingMatch(false);
    }
  }

  async function handleRelease() {
    if (!claim || !canRelease || releasing) return;

    setReleasing(true);
    setReleaseError('');

    try {
      const updated = await updateClaimStatus(claim.claimId, {
        status: 'picked_up',
      });
      setClaim(updated);
    } catch (err) {
      setReleaseError(
        err instanceof Error ? err.message : 'Failed to release item.'
      );
    } finally {
      setReleasing(false);
    }
  }

  return (
    <Stack gap={6}>
      <ClaimDetailHeader
        claimId={claim.claimId}
        submittedAt={claim.createdAt}
        status={displayStatus}
        subtitle={headerSubtitle}
        onBack={() => router.push('/security/claims')}
      />

      <CloseClaimDialog
        claim={claim}
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        onClosed={setClaim}
      />

      {claim.rejectionReason ? (
        <Box
          bg="red.50"
          borderRadius="lg"
          px={4}
          py={3}
          borderWidth="1px"
          borderColor="red.200"
        >
          <Text fontSize="sm" fontWeight="semibold" color="red.800" mb={1}>
            Rejection Reason
          </Text>
          <Text fontSize="sm" color="red.700">
            {claim.rejectionReason}
          </Text>
        </Box>
      ) : null}

      {showMatchingLayout ? (
        <Grid
          templateColumns={{
            base: '1fr',
            lg: 'minmax(0, 1fr) minmax(0, 1.1fr)',
          }}
          gap={6}
          alignItems="start"
        >
          <ClaimDetailsCard claim={claim} />

          <Stack gap={2}>
            <ClaimMatchPanel
              claim={claim}
              variant={matchPanelVariant}
              suggestions={suggestions}
              selectedItemId={selectedItemId}
              onSelectItem={setSelectedItemId}
              onConfirmMatch={handleConfirmMatch}
              onCloseClaim={
                canCloseClaim ? () => setCloseDialogOpen(true) : undefined
              }
              generating={generatingMatches}
              confirming={confirmingMatch}
            />
            {matchError ? (
              <Text fontSize="sm" color="red.500">
                {matchError}
              </Text>
            ) : null}
          </Stack>
        </Grid>
      ) : (
        <Grid
          templateColumns={{
            base: '1fr',
            lg: showWorkflowSidebar ? 'minmax(0, 1.4fr) 300px' : '1fr',
          }}
          gap={6}
          alignItems="start"
        >
          <Stack gap={6}>
            {mode === 'post_match' ? (
              <>
                <ClaimMatchedItemCard claim={claim} />
                <ClaimPickupNoticeCard
                  claim={claim}
                  campusName={pickupCampusName}
                />
                <ClaimVerificationChecklist
                  value={verification}
                  onChange={setVerification}
                />
                <ClaimReleaseCard
                  canRelease={canRelease}
                  disabledReason={releaseDisabledReason}
                  onRelease={handleRelease}
                  releasing={releasing}
                  releaseError={releaseError}
                />
                {canCloseClaim ? (
                  <Flex justify="flex-start">
                    <CloseClaimButton
                      onClick={() => setCloseDialogOpen(true)}
                    />
                  </Flex>
                ) : null}
              </>
            ) : (
              <>
                <ClaimDetailsCard claim={claim} />
                {claim.item ? <ClaimMatchedItemCard claim={claim} /> : null}
              </>
            )}
          </Stack>

          {showWorkflowSidebar ? (
            <ClaimStatusStepper steps={workflowSteps} />
          ) : null}
        </Grid>
      )}
    </Stack>
  );
}
