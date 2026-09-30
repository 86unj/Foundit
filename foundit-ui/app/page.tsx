'use client';

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { FixedPageBackground } from '@/components/PageBackground';
import { PageCard } from '@/components/PageCard';
import { Button } from '@/components/ui/Button';
import { Box, Heading, Stack, Text } from '@chakra-ui/react';
import { useRouter } from 'next/navigation';

export default function Home() {
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
            <Heading as="h1" fontSize="4xl" color="fg">
              Welcome
            </Heading>

            <Text color="fg.muted" fontSize="sm">
              Please proceed login with your school account
            </Text>

            <Stack gap={2} alignItems="center">
              <Button
                minW={44}
                h={12}
                rounded="xl"
                fontSize="md"
                onClick={() => router.push('/login')}
              >
                Login
              </Button>
              <Button
                variant="outline"
                minW={44}
                h={12}
                rounded="xl"
                fontSize="md"
                onClick={() => router.push('/signup')}
              >
                Sign Up
              </Button>
            </Stack>

            <Stack gap={1}>
              <Text fontSize="sm" color="fg.muted">
                Lost and found office hours
              </Text>
              <Text fontSize="sm" color="fg.muted">
                Mon - Fri &nbsp;&nbsp;&nbsp;&nbsp; 9:00AM - 5:00PM
              </Text>
            </Stack>
          </PageCard>
        </Box>
        <Footer />
      </Box>
    </Box>
  );
}
