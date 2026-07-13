'use client';

import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { FixedPageBackground } from '@/components/PageBackground';
import TextInput from '../../components/TextInput';
import {
  Box,
  Button,
  Stack,
  Heading,
  HStack,
  Link,
  Text,
  Checkbox,
} from '@chakra-ui/react';
import { useSignUpForm } from '../../hooks/useSignupForm';
import { useState } from 'react';
import LegalModal from '../../components/legal/LegalModal';
import LegalAgreement from '../../components/legal/LegalAgreement';
export default function SignUpPage() {
  const {
    email,
    setEmail,
    emailError,
    handleEmailBlur,

    firstName,
    setFirstName,

    lastName,
    setLastName,

    password,
    setPassword,

    confirmPassword,
    setConfirmPassword,

    firstNameError,
    lastNameError,
    passwordError,
    confirmPasswordError,

    handleSignUp,
    isSubmitting,

    agreedToLegal,
    legalAgreementError,
    handleLegalAgreementChange,
  } = useSignUpForm();

  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const handleLegalModalClose = () => {
    setIsLegalModalOpen(false);
  };

  const handleLegalAgree = () => {
    handleLegalAgreementChange(true);
    setIsLegalModalOpen(false);
  };

  const handleLegalDisagree = () => {
    handleLegalAgreementChange(false);
    setIsLegalModalOpen(false);
  };

  return (
    <Box minH="100vh" display="flex" flexDirection="column" position="relative">
      <FixedPageBackground overlay />

      <Box
        position="relative"
        zIndex={1}
        minH="100vh"
        display="flex"
        flexDirection="column"
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
            p="50px"
            gap="28px"
            my={12}
          >
            <Heading fontSize="40px" textAlign="center" color="#0F172A">
              Sign Up
            </Heading>
            <Stack gap="20px">
              <HStack gap="24px" align="flex-start">
                <TextInput
                  id="firstName"
                  label="First Name"
                  value={firstName}
                  width="full"
                  onChange={(e) => setFirstName(e.target.value)}
                  error={firstNameError}
                />

                <TextInput
                  id="lastName"
                  label="Last Name"
                  value={lastName}
                  width="full"
                  onChange={(e) => setLastName(e.target.value)}
                  error={lastNameError}
                />
              </HStack>
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
              {/* <TextInput
                id="schoolId"
                label="Student/Employee ID"
                value={schoolId}
                width="full"
                onChange={(e) => setSchoolId(e.target.value)}
                onBlur={() => validateSchoolIdField(schoolId)}
                error={schoolIdError}
              /> */}

              <TextInput
                id="password"
                label="Password"
                type="password"
                autoComplete="new-password"
                value={password}
                width="full"
                onChange={(e) => setPassword(e.target.value)}
                error={passwordError}
              />

              <TextInput
                id="confirmPassword"
                label="Confirm Password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                width="full"
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={confirmPasswordError}
              />
            </Stack>
            <Stack gap="1px">
              {legalAgreementError && (
                <Text color="#CD0000" fontSize="sm" mt={1}>
                  {legalAgreementError}
                </Text>
              )}
              <Checkbox.Root
                checked={agreedToLegal}
                onCheckedChange={(e) => {
                  handleLegalAgreementChange(e.checked === true);
                }}
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control />
                <Checkbox.Label>
                  <LegalAgreement onOpen={() => setIsLegalModalOpen(true)} />
                </Checkbox.Label>
              </Checkbox.Root>

              <LegalModal
                open={isLegalModalOpen}
                onClose={handleLegalModalClose}
                onAgree={handleLegalAgree}
                onDisagree={handleLegalDisagree}
              />
            </Stack>

            <Button
              w="172px"
              h="48px"
              rounded="12px"
              fontSize="16px"
              colorPalette="blue"
              onClick={handleSignUp}
              alignSelf="center"
              disabled={isSubmitting}
              loading={isSubmitting}
              loadingText="Signing up..."
            >
              Sign Up
            </Button>
            <Text textAlign="center" fontSize="14px">
              Already have an account?{' '}
              <Link href="/login" color="blue.500">
                Login here
              </Link>
            </Text>
          </Stack>
        </Box>

        <Footer />
      </Box>
    </Box>
  );
}
