'use client';

import { Stack, type StackProps } from '@chakra-ui/react';

export function PageCard({ children, ...props }: StackProps) {
  return (
    <Stack
      bg="bg"
      rounded="md"
      shadow="md"
      w="full"
      maxW="lg"
      p={{ base: 8, md: 12 }}
      gap={7}
      my={12}
      {...props}
    >
      {children}
    </Stack>
  );
}
