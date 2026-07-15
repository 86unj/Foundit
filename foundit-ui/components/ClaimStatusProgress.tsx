'use client';

import { Box, Flex, Text } from '@chakra-ui/react';
import { IoCheckmark } from 'react-icons/io5';
import type { ApiClaimStatus } from '@/types/claims';

const CLAIM_STEPS: ApiClaimStatus[] = [
  'submitted',
  'under_review',
  'approved',
  'picked_up',
];

const CLAIM_STATUS_LABELS: Record<ApiClaimStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  approved: 'Match Found',
  rejected: 'Rejected',
  picked_up: 'Completed',
};

type StepState = 'complete' | 'active' | 'pending';

type Props = {
  status: ApiClaimStatus;
};

function StepCircle({
  stepNumber,
  state,
}: {
  stepNumber: number;
  state: StepState;
}) {
  if (state === 'complete') {
    return (
      <Flex
        w={{ base: '36px', md: '40px' }}
        h={{ base: '36px', md: '40px' }}
        borderRadius="full"
        bg="blue.500"
        color="white"
        align="center"
        justify="center"
        flexShrink={0}
        aria-hidden
      >
        <IoCheckmark size={20} />
      </Flex>
    );
  }

  if (state === 'active') {
    return (
      <Flex
        w={{ base: '36px', md: '40px' }}
        h={{ base: '36px', md: '40px' }}
        borderRadius="full"
        borderWidth="2px"
        borderColor="blue.500"
        bg="blue.50"
        color="blue.700"
        align="center"
        justify="center"
        flexShrink={0}
        fontSize={{ base: 'sm', md: 'md' }}
        fontWeight="bold"
        aria-hidden
      >
        {stepNumber}
      </Flex>
    );
  }

  return (
    <Flex
      w={{ base: '36px', md: '40px' }}
      h={{ base: '36px', md: '40px' }}
      borderRadius="full"
      borderWidth="2px"
      borderColor="gray.300"
      bg="white"
      color="gray.500"
      align="center"
      justify="center"
      flexShrink={0}
      fontSize={{ base: 'sm', md: 'md' }}
      fontWeight="bold"
      aria-hidden
    >
      {stepNumber}
    </Flex>
  );
}

export function ClaimStatusProgress({ status }: Props) {
  if (status === 'rejected') {
    return (
      <Text fontSize="md" fontWeight="semibold" color="fg.error">
        Rejected
      </Text>
    );
  }

  const activeIndex = Math.max(0, CLAIM_STEPS.indexOf(status));
  const isFullyComplete = status === 'picked_up';

  return (
    <Box w="full" role="list" aria-label="Claim status progress">
      <Flex align="flex-start" w="full">
        {CLAIM_STEPS.map((step, index) => {
          const isLast = index === CLAIM_STEPS.length - 1;
          const state: StepState =
            index < activeIndex || (isFullyComplete && index === activeIndex)
              ? 'complete'
              : index === activeIndex
                ? 'active'
                : 'pending';
          const label = CLAIM_STATUS_LABELS[step];
          const stepNumber = index + 1;

          return (
            <Flex
              key={step}
              role="listitem"
              align="center"
              flex={isLast ? '0 0 auto' : 1}
              minW={0}
              aria-current={state === 'active' ? 'step' : undefined}
            >
              <Flex
                direction="column"
                align="center"
                gap={2}
                flexShrink={0}
                w={{ base: '64px', md: '88px' }}
              >
                <StepCircle stepNumber={stepNumber} state={state} />
                <Text
                  fontSize={{ base: 'xs', md: 'sm' }}
                  fontWeight={state === 'pending' ? 'medium' : 'semibold'}
                  color={state === 'pending' ? 'fg.muted' : 'blue.700'}
                  textAlign="center"
                  lineHeight="short"
                >
                  {label}
                </Text>
              </Flex>

              {!isLast && (
                <Box
                  flex={1}
                  h="3px"
                  mx={{ base: 1, md: 2 }}
                  mt={{ base: '16px', md: '18px' }}
                  alignSelf="flex-start"
                  borderRadius="full"
                  bg={
                    index < activeIndex || isFullyComplete
                      ? 'blue.400'
                      : 'gray.200'
                  }
                  aria-hidden
                />
              )}
            </Flex>
          );
        })}
      </Flex>
    </Box>
  );
}
