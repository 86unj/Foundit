'use client';

import { Heading, Stack, Text, Textarea, Flex, chakra } from '@chakra-ui/react';
import { ClaimCard } from './ClaimCard';

const Checkbox = chakra('input');

export interface VerificationState {
  verifyStudentId: boolean;
  proofOfOwnership: boolean;
  studentConfirmation: boolean;
  notes: string;
}

interface ClaimVerificationChecklistProps {
  value: VerificationState;
  onChange: (value: VerificationState) => void;
  compact?: boolean;
}

const checklistItems = [
  {
    key: 'verifyStudentId' as const,
    label: 'Verify Photo ID / Student ID',
    description: 'Confirm the claimant presents valid photo ID.',
  },
  {
    key: 'proofOfOwnership' as const,
    label: 'Proof of Ownership',
    description:
      'Ask for details only the owner would know (case marks, lock screen, etc.).',
  },
  {
    key: 'studentConfirmation' as const,
    label: 'Owner Confirmation',
    description:
      'Claimant confirms the item matches their lost item description.',
  },
];

export function ClaimVerificationChecklist({
  value,
  onChange,
  compact = false,
}: ClaimVerificationChecklistProps) {
  function toggle(key: keyof Omit<VerificationState, 'notes'>) {
    onChange({ ...value, [key]: !value[key] });
  }

  return (
    <ClaimCard p={compact ? 4 : 6}>
      <Heading
        as="h2"
        fontSize={compact ? 'md' : 'lg'}
        fontWeight="bold"
        color="gray.900"
        mb={compact ? 3 : 4}
      >
        Verification Checklist
      </Heading>
      <Stack gap={compact ? 2.5 : 4}>
        {checklistItems.map((item) => (
          <Flex key={item.key} gap={3} align="start">
            <Checkbox
              type="checkbox"
              mt={1}
              checked={value[item.key]}
              onChange={() => toggle(item.key)}
              accentColor="var(--chakra-colors-blue-500)"
            />
            <Stack gap={0.5}>
              <Text fontSize="sm" fontWeight="semibold" color="gray.900">
                {item.label}
              </Text>
              <Text fontSize="xs" color="gray.600">
                {item.description}
              </Text>
            </Stack>
          </Flex>
        ))}
        <Stack gap={1}>
          <Text
            fontSize="xs"
            fontWeight="semibold"
            color="gray.500"
            textTransform="uppercase"
          >
            Notes (optional)
          </Text>
          <Textarea
            value={value.notes}
            onChange={(e) => onChange({ ...value, notes: e.target.value })}
            placeholder="Add any verification notes..."
            rows={compact ? 2 : 3}
            fontSize="sm"
          />
        </Stack>
      </Stack>
    </ClaimCard>
  );
}

export function isVerificationComplete(value: VerificationState): boolean {
  return (
    value.verifyStudentId && value.proofOfOwnership && value.studentConfirmation
  );
}
