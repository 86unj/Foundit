'use client';

import Link from 'next/link';
import { Box, Flex, Heading, Stack, Text } from '@chakra-ui/react';
import { IoCheckmarkCircleOutline } from 'react-icons/io5';
import { Button } from '@/components/ui/Button';
import { FixedPageBackground } from '@/components/PageBackground';
import { ROLE_HOME } from '@/utils/routes';

// Confirmation screen after a successful claim submit (useClaimItemForm
// pushes CLAIM_SUBMITTED_PATH). Lives under app/student/ so it inherits
// RoleShell and the student-role gate.
export default function ClaimSubmittedPage() {
  return (
    <>
      <FixedPageBackground overlay />

      <Box
        position="relative"
        zIndex={1}
        display="flex"
        alignItems="center"
        justifyContent="center"
        px={4}
        py={{ base: 8, md: 12 }}
      >
        <Stack
          bg="white"
          rounded="md"
          shadow="md"
          maxW="560px"
          w="full"
          p={{ base: 8, md: 12 }}
          gap={8}
          align="center"
          textAlign="center"
        >
          <Flex
            w={16}
            h={16}
            rounded="full"
            bg="blue.50"
            color="blue.600"
            align="center"
            justify="center"
            flexShrink={0}
            aria-hidden
          >
            <IoCheckmarkCircleOutline size={36} />
          </Flex>

          <Stack gap={3} align="center" maxW="420px">
            <Heading
              as="h1"
              fontSize={{ base: '2xl', md: '40px' }}
              color="fg"
              fontWeight="bold"
              lineHeight="short"
            >
              Claim submitted
            </Heading>
            <Text color="fg.muted" fontSize="md" lineHeight="tall">
              Your claim has been received and is now under review. Security
              will verify the details and contact you when there is an update.
            </Text>
          </Stack>

          <Button
            asChild
            variant="primary"
            size="lg"
            h="48px"
            px={8}
            rounded="12px"
          >
            <Link href={ROLE_HOME.student}>Back to Dashboard</Link>
          </Button>
        </Stack>
      </Box>
    </>
  );
}
