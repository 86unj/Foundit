'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { FixedPageBackground } from '@/components/PageBackground';
import { Box, Button, Heading, Stack, Text } from '@chakra-ui/react';
import { ApiError } from '@/lib/api/client';
import { verifyEmail } from '@/lib/api/auth';

type VerifyStatus = 'loading' | 'success' | 'error';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';

  const [status, setStatus] = useState<VerifyStatus>(
    token ? 'loading' : 'error'
  );
  const [errorMessage, setErrorMessage] = useState(
    token
      ? ''
      : 'This verification link is missing a token. Please use the link from your email, or sign up again.'
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    verifyEmail(token)
      .then(() => {
        if (!cancelled) {
          setStatus('success');
        }
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setStatus('error');
        if (err instanceof ApiError) {
          setErrorMessage(err.message);
          return;
        }
        setErrorMessage('Unable to verify your email. Please try again.');
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (status !== 'success') {
      return;
    }

    const timer = window.setTimeout(() => {
      router.push('/login');
    }, 2000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [status, router]);

  const heading =
    status === 'loading'
      ? 'Verifying'
      : status === 'success'
        ? 'Welcome'
        : 'Verification failed';

  const body =
    status === 'loading'
      ? 'Please wait while we verify your email…'
      : status === 'success'
        ? 'Your account is now verified.\nRedirecting to login…'
        : errorMessage;

  return (
    <Stack
      bg="bg"
      rounded="md"
      shadow="md"
      p={8}
      w="380px"
      minH="235px"
      alignItems="center"
      textAlign="center"
    >
      <Heading fontSize="40px" color="fg" mb={6}>
        {heading}
      </Heading>

      <Text mb={12} color="fg.muted" pt={10} whiteSpace="pre-line">
        {body}
      </Text>

      {status !== 'loading' && (
        <Button
          w="172px"
          h="48px"
          rounded="12px"
          fontSize="16px"
          colorPalette="blue"
          onClick={() =>
            router.push(status === 'success' ? '/login' : '/signup')
          }
        >
          {status === 'success' ? 'Login' : 'Sign up'}
        </Button>
      )}
    </Stack>
  );
}

export default function VerifyEmailPage() {
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
        >
          <Suspense
            fallback={
              <Stack
                bg="bg"
                rounded="md"
                shadow="md"
                p={8}
                w="380px"
                minH="235px"
                alignItems="center"
                textAlign="center"
              >
                <Heading fontSize="40px" color="fg" mb={6}>
                  Verifying
                </Heading>
                <Text mb={12} color="fg.muted" pt={10}>
                  Please wait while we verify your email…
                </Text>
              </Stack>
            }
          >
            <VerifyEmailContent />
          </Suspense>
        </Box>
        <Footer />
      </Box>
    </Box>
  );
}
