'use client';

import { Box, Flex, Stack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';
import type { ReactNode } from 'react';
import { IoChevronForward } from 'react-icons/io5';

export interface DashboardMetricCardProps {
  title: string;
  value: number | string;
  subtitle: string;
  icon: ReactNode;
  accentColor: string;
  iconBg: string;
  href?: string;
}

export function DashboardMetricCard({
  title,
  value,
  subtitle,
  icon,
  accentColor,
  iconBg,
  href,
}: DashboardMetricCardProps) {
  const card = (
    <Flex align="center" gap={4}>
      <Flex
        align="center"
        justify="center"
        w={14}
        h={14}
        borderRadius="full"
        bg={iconBg}
        color={accentColor}
        flexShrink={0}
      >
        {icon}
      </Flex>

      <Stack gap={0.5} flex={1} minW={0}>
        <Text fontSize="sm" color="gray.600" fontWeight="medium">
          {title}
        </Text>
        <Text
          fontSize="3xl"
          fontWeight="bold"
          color="gray.900"
          lineHeight="1.1"
        >
          {value}
        </Text>
        <Text fontSize="xs" color="gray.500">
          {subtitle}
        </Text>
      </Stack>

      {href ? (
        <Box
          as="span"
          color="gray.400"
          flexShrink={0}
          display="flex"
          alignItems="center"
          aria-hidden
        >
          <IoChevronForward size={20} />
        </Box>
      ) : null}
    </Flex>
  );

  if (!href) {
    return (
      <Box
        bg="white"
        borderWidth="1px"
        borderColor="gray.200"
        borderRadius="lg"
        px={5}
        py={5}
        h="full"
        minW={0}
      >
        {card}
      </Box>
    );
  }

  return (
    <Box
      asChild
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      px={5}
      py={5}
      h="full"
      minW={0}
      transition="border-color 0.15s ease, box-shadow 0.15s ease"
      _hover={{
        borderColor: 'gray.300',
        boxShadow: 'sm',
      }}
      _focusVisible={{
        outline: 'none',
        boxShadow: '0 0 0 2px {colors.focusRing}',
      }}
    >
      <NextLink href={href} aria-label={`View ${title}`}>
        {card}
      </NextLink>
    </Box>
  );
}
