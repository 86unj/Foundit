'use client';

import { useState, type ReactNode } from 'react';
import {
  Badge,
  Box,
  Dialog,
  Flex,
  Heading,
  IconButton,
  Button,
  Image,
  Portal,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react';

import { LuX } from 'react-icons/lu';
import type { SecurityClaimListItem } from '@/types/claims';
import { ClaimStatusProgress } from '@/components/ClaimStatusProgress';
import { ClaimDetailField } from '@/components/claims/ClaimDetailField';
import { deleteClaim } from '@/lib/api/claims';
import {
  formatClaimDate,
  formatClaimDateTime,
  formatClaimId,
  getClaimItemName,
  getStudentClaimDisplayStatus,
} from '@/utils/claimDisplay';

type Props = {
  claim: SecurityClaimListItem | null;
  isOpen: boolean;
  onClose: () => void;
  /** Called after the claim is successfully cancelled, so the parent can
   * drop it from its list. */
  onCancelled?: (claimId: string) => void;
};

function StatusNotice({
  title,
  children,
  palette,
}: {
  title: string;
  children: ReactNode;
  palette: 'blue' | 'green' | 'red';
}) {
  const styles = {
    blue: {
      bg: 'blue.50',
      borderColor: 'blue.200',
      title: 'blue.900',
      body: 'blue.800',
    },
    green: {
      bg: 'green.50',
      borderColor: 'green.200',
      title: 'green.900',
      body: 'green.800',
    },
    red: {
      bg: 'red.50',
      borderColor: 'red.200',
      title: 'red.900',
      body: 'red.800',
    },
  }[palette];

  return (
    <Box
      p={4}
      borderRadius="lg"
      bg={styles.bg}
      borderWidth="1px"
      borderColor={styles.borderColor}
    >
      <Text fontWeight="bold" color={styles.title} mb={2}>
        {title}
      </Text>
      <Stack gap={1} fontSize="sm" color={styles.body}>
        {children}
      </Stack>
    </Box>
  );
}

export function ClaimDetailModal({
  claim,
  isOpen,
  onClose,
  onCancelled,
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  function handleClose() {
    if (cancelling) return;
    setConfirmOpen(false);
    setCancelError('');
    onClose();
  }

  async function handleConfirmCancel() {
    if (!claim || cancelling) return;

    setCancelling(true);
    setCancelError('');
    try {
      await deleteClaim(claim.claimId);
      setConfirmOpen(false);
      onCancelled?.(claim.claimId);
      onClose();
    } catch (err) {
      setCancelError(
        err instanceof Error ? err.message : 'Failed to cancel claim.'
      );
    } finally {
      setCancelling(false);
    }
  }

  const displayStatus = claim ? getStudentClaimDisplayStatus(claim) : null;
  const itemName = claim ? getClaimItemName(claim) : '';
  const category = claim ? (claim.item?.category ?? claim.category) : '';
  const canCancel = claim?.status === 'submitted';
  const showPickupInstructions =
    claim?.status === 'approved' && Boolean(claim.item);
  const showPickupComplete = claim?.status === 'picked_up';
  const showRejected = claim?.status === 'rejected';

  return (
    <>
      <Dialog.Root
        open={isOpen && !!claim}
        lazyMount
        unmountOnExit
        onOpenChange={(details) => {
          if (!details.open) handleClose();
        }}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content
              position="relative"
              maxW="900px"
              p={{ base: 5, md: 8 }}
              maxH="90vh"
              overflowY="auto"
            >
              {claim && displayStatus && (
                <>
                  <IconButton
                    aria-label="Close"
                    variant="ghost"
                    size="sm"
                    position="absolute"
                    top={4}
                    right={4}
                    onClick={handleClose}
                  >
                    <LuX />
                  </IconButton>

                  <Stack gap={6} pr={8}>
                    <Flex
                      justify="space-between"
                      align={{ base: 'flex-start', md: 'center' }}
                      direction={{ base: 'column', md: 'row' }}
                      gap={3}
                    >
                      <Stack gap={1} minW={0}>
                        <Heading
                          as="h2"
                          fontSize={{ base: 'xl', md: '2xl' }}
                          fontWeight="bold"
                          color="fg"
                          lineClamp={2}
                        >
                          {itemName}
                        </Heading>
                        <Text fontSize="sm" color="fg.muted">
                          {category} · Claim #{formatClaimId(claim.claimId)}
                        </Text>
                      </Stack>
                      <Badge
                        colorPalette={displayStatus.colorPalette}
                        variant="subtle"
                        fontSize="sm"
                        px={3}
                        py={1}
                        borderRadius="md"
                        fontWeight="semibold"
                        flexShrink={0}
                      >
                        {displayStatus.label}
                      </Badge>
                    </Flex>

                    <Box w="full" pt={1}>
                      <ClaimStatusProgress status={claim.status} />
                    </Box>

                    {(showPickupInstructions ||
                      showPickupComplete ||
                      showRejected) && (
                      <Stack gap={3}>
                        {showPickupInstructions && (
                          <StatusNotice title="Match Found" palette="blue">
                            <Text>
                              A match was found for your claim (
                              {claim.item?.title ?? 'item'}). Visit the{' '}
                              {claim.item?.campus.campusName ?? 'campus'}{' '}
                              security office with your student ID.
                            </Text>
                            <Text>
                              Staff will verify your identity before releasing
                              the item. Please visit during office hours.
                            </Text>
                          </StatusNotice>
                        )}

                        {showPickupComplete && (
                          <StatusNotice title="Completed" palette="green">
                            <Text>
                              {claim.pickedUpAt
                                ? `You collected your item on ${formatClaimDateTime(claim.pickedUpAt)}.`
                                : 'You have collected your item.'}
                            </Text>
                          </StatusNotice>
                        )}

                        {showRejected && (
                          <StatusNotice title="Rejected" palette="red">
                            <Text>
                              {claim.rejectionReason?.trim()
                                ? claim.rejectionReason
                                : 'This claim was closed without a release. You can submit a new claim if you still need help finding your item.'}
                            </Text>
                          </StatusNotice>
                        )}
                      </Stack>
                    )}

                    <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} gap={4}>
                      <ClaimDetailField
                        label="Date Lost"
                        value={formatClaimDate(claim.dateLost)}
                      />
                      <ClaimDetailField
                        label="Location Lost"
                        value={claim.locationLost?.trim() || '—'}
                      />
                      <ClaimDetailField
                        label="Submitted"
                        value={formatClaimDateTime(claim.createdAt)}
                      />
                    </SimpleGrid>

                    <Stack gap={2}>
                      <Text fontWeight="semibold" fontSize="sm" color="fg">
                        Description
                      </Text>
                      <Box bg="gray.50" borderRadius="md" p={4}>
                        <Text fontSize="sm" color="fg" whiteSpace="pre-wrap">
                          {claim.description || '—'}
                        </Text>
                      </Box>
                    </Stack>

                    {claim.additionalInfo?.trim() && (
                      <Stack gap={2}>
                        <Text fontWeight="semibold" fontSize="sm" color="fg">
                          Additional Information
                        </Text>
                        <Box bg="gray.50" borderRadius="md" p={4}>
                          <Text fontSize="sm" color="fg" whiteSpace="pre-wrap">
                            {claim.additionalInfo}
                          </Text>
                        </Box>
                      </Stack>
                    )}

                    {claim.images.length > 0 && (
                      <Stack gap={2}>
                        <Text fontWeight="semibold" fontSize="sm" color="fg">
                          Proof of Ownership
                        </Text>
                        <Flex gap={3} flexWrap="wrap">
                          {claim.images.map((image) => (
                            <Image
                              key={image.imageId}
                              src={image.imageUrl}
                              alt={`${itemName} proof`}
                              boxSize="120px"
                              objectFit="cover"
                              borderRadius="md"
                              borderWidth="1px"
                              borderColor="border.input"
                            />
                          ))}
                        </Flex>
                      </Stack>
                    )}

                    {canCancel && (
                      <Flex justify="flex-end" pt={2}>
                        <Button
                          colorPalette="red"
                          onClick={() => {
                            setCancelError('');
                            setConfirmOpen(true);
                          }}
                        >
                          Cancel Claim
                        </Button>
                      </Flex>
                    )}
                  </Stack>
                </>
              )}
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      <Dialog.Root
        open={confirmOpen}
        role="alertdialog"
        lazyMount
        unmountOnExit
        onOpenChange={(details) => {
          if (!details.open && !cancelling) setConfirmOpen(false);
        }}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content maxW="400px" p={6}>
              <Text fontSize="lg" fontWeight="bold" mb={2}>
                Cancel this claim?
              </Text>
              <Text color="fg.muted" fontSize="sm">
                This cannot be undone. You will need to submit a new claim if
                you change your mind.
              </Text>

              {cancelError && (
                <Text color="fg.error" fontSize="sm" mt={3}>
                  {cancelError}
                </Text>
              )}

              <Flex justify="flex-end" gap={3} mt={6}>
                <Button
                  variant="outline"
                  onClick={() => setConfirmOpen(false)}
                  disabled={cancelling}
                >
                  No, go back
                </Button>
                <Button
                  colorPalette="red"
                  onClick={handleConfirmCancel}
                  loading={cancelling}
                  loadingText="Cancelling..."
                >
                  Yes, cancel claim
                </Button>
              </Flex>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}
