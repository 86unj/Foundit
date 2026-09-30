'use client';

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { FixedPageBackground } from '@/components/PageBackground';
import { PageCard } from '@/components/PageCard';
import { Button } from '@/components/ui/Button';
import { Box, Flex, Heading, Text } from '@chakra-ui/react';
import { useRouter } from 'next/navigation';
import { IoMailOutline } from 'react-icons/io5';

export default function SignupSuccessPage() {
  const router = useRouter();

  return (
    <Box minH="100vh" display="flex" flexDirection="column" position="relative">
      <FixedPageBackground overlay />

      <Box
        position="relative"
        zIndex={1}
        display="flex"
        flexDirection="column"
        minH="100vh"
      >
        <Navbar variant="guest" />

        <Box
          flex={1}
          display="flex"
          alignItems="center"
          justifyContent="center"
          px={4}
        >
          <PageCard alignItems="center" textAlign="center">
            <Flex
              w={16}
              h={16}
              rounded="full"
              bg="blue.50"
              color="blue.600"
              alignItems="center"
              justifyContent="center"
              flexShrink={0}
              aria-hidden
            >
              <IoMailOutline size={32} />
            </Flex>
            <Heading as="h1" fontSize="4xl" color="fg">
              Check your email
            </Heading>

            <Text color="fg.muted" fontSize="sm">
              We sent a verification link to your Seneca email. Open it to
              activate your account.
            </Text>
            <Button
              minW={44}
              h={12}
              rounded="xl"
              fontSize="md"
              onClick={() => router.push('/login')}
            >
              Back to Login
            </Button>
          </PageCard>
        </Box>

        <Footer />
      </Box>
    </Box>
  );
}
