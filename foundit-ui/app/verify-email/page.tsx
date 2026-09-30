'use client';

import {
  Suspense,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { FixedPageBackground } from '@/components/PageBackground';
import { PageCard } from '@/components/PageCard';
import { Button } from '@/components/ui/Button';
import { Box, Flex, Heading, Text } from '@chakra-ui/react';
import { ApiError } from '@/lib/api/client';
import { verifyEmail } from '@/lib/api/auth';
import {
  IoAlertCircleOutline,
  IoCheckmarkCircleOutline,
  IoHourglassOutline,
} from 'react-icons/io5';

function subscribeToHashChange(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

type VerifyStatus = 'loading' | 'success' | 'error';

const statusIcon: Record<VerifyStatus, ReactNode> = {
  loading: <IoHourglassOutline size={32} />,
  success: <IoCheckmarkCircleOutline size={32} />,
  error: <IoAlertCircleOutline size={32} />,
};

function VerifyEmailCard({
  heading,
  body,
  status,
  action,
}: {
  heading: string;
  body: string;
  status: VerifyStatus;
  action?: { label: string; href: string };
}) {
  const router = useRouter();

  return (
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
        {statusIcon[status]}
      </Flex>

      <Heading as="h1" fontSize="4xl" color="fg">
        {heading}
      </Heading>

      <Text color="fg.muted" fontSize="sm" whiteSpace="pre-line">
        {body}
      </Text>

      {action && (
        <Button
          minW={44}
          h={12}
          rounded="xl"
          fontSize="md"
          onClick={() => router.push(action.href)}
        >
          {action.label}
        </Button>
      )}
    </PageCard>
  );
}

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Fragments are only available in the browser; wait for hydration before verifying.
  const token = useSyncExternalStore(
    subscribeToHashChange,
    () =>
      (
        new URLSearchParams(window.location.hash.slice(1)).get('token') ??
        searchParams.get('token') ??
        ''
      ).trim(),
    () => null
  );

  const [result, setResult] = useState<{
    token: string;
    status: VerifyStatus;
    errorMessage?: string;
  } | null>(null);
  const status =
    token === ''
      ? 'error'
      : result?.token === token
        ? result.status
        : 'loading';
  const errorMessage =
    token === ''
      ? 'This verification link is missing a token. Please use the link from your email, or sign up again.'
      : result?.errorMessage;

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    verifyEmail(token)
      .then(() => {
        if (!cancelled) {
          setResult({ token, status: 'success' });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setResult({
          token,
          status: 'error',
          errorMessage:
            err instanceof ApiError
              ? err.message
              : 'Unable to verify your email. Please try again.',
        });
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
        : (errorMessage ?? '');

  return (
    <VerifyEmailCard
      heading={heading}
      body={body}
      status={status}
      action={
        status === 'loading'
          ? undefined
          : status === 'success'
            ? { label: 'Login', href: '/login' }
            : { label: 'Sign up', href: '/signup' }
      }
    />
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
          px={4}
        >
          <Suspense
            fallback={
              <VerifyEmailCard
                heading="Verifying"
                body="Please wait while we verify your email…"
                status="loading"
              />
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
