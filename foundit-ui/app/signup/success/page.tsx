'use client';

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { FixedPageBackground } from '@/components/PageBackground';
import { Box, Button, Flex, Heading, Stack, Text } from '@chakra-ui/react';
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
          <Stack
            bg="white"
            rounded="md"
            shadow="md"
            w="532px"
            maxW="full"
            p={{ base: 8, md: '50px' }}
            my={12}
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
              <IoMailOutline size={32} />
            </Flex>

            <Stack gap={3} align="center" maxW="400px">
              <Heading
                as="h1"
                fontSize={{ base: '2xl', md: '40px' }}
                color="fg"
                fontWeight="bold"
                lineHeight="short"
              >
                Check your email
              </Heading>
              <Text color="fg.muted" fontSize="md" lineHeight="tall" mb={4}>
                We sent a verification link to your Seneca email. Open it to
                activate your account.
              </Text>
            </Stack>

            <Button
              w="172px"
              h="48px"
              rounded="12px"
              fontSize="16px"
              colorPalette="blue"
              onClick={() => router.push('/login')}
            >
              Back to Login
            </Button>
          </Stack>
        </Box>

        <Footer />
      </Box>
    </Box>
  );
}
