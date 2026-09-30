'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { FixedPageBackground } from '@/components/PageBackground';
import { PageCard } from '@/components/PageCard';
import { Button } from '@/components/ui/Button';
import TextInput from '@/components/TextInput';
import { Box, Heading, Link, Stack, Text } from '@chakra-ui/react';
import { useLoginForm } from '@/hooks/useLoginForm';

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect');
  const {
    email,
    setEmail,
    password,
    setPassword,
    emailError,
    passwordError,
    handleEmailBlur,
    handleLogin,
    isSubmitting,
  } = useLoginForm(redirectTo);

  return (
    // A real <form> so Enter submits from either field (and password
    // managers recognize the login form).
    <PageCard
      as="form"
      onSubmit={(e: React.FormEvent) => {
        e.preventDefault();
        handleLogin();
      }}
    >
      <Heading as="h1" fontSize="4xl" textAlign="center" color="fg">
        Login
      </Heading>
      <Stack gap={5} alignItems="center">
        <TextInput
          placeholder="example@myseneca.ca"
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          width="full"
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
          onBlur={handleEmailBlur}
        />

        <TextInput
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={passwordError}
        />
      </Stack>
      <Button
        type="submit"
        minW={44}
        h={12}
        rounded="xl"
        fontSize="md"
        alignSelf="center"
        disabled={isSubmitting}
        loading={isSubmitting}
        loadingText="Logging in..."
      >
        Login
      </Button>

      <Text textAlign="center" fontSize="sm" color="fg.muted">
        Don&apos;t have an account?{' '}
        <Link href="/signup" color="blue.500">
          Sign up here
        </Link>
      </Text>
    </PageCard>
  );
}

export default function LoginPage() {
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
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </Box>

        <Footer />
      </Box>
    </Box>
  );
}
