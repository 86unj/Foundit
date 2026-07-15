'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE } from '@/lib/api/client';
import {
  validateRequired,
  validatePassword,
  validatePasswordMatch,
  validateEmail,
} from '@/utils/validation';

export function useSignUpForm() {
  const router = useRouter();

  const [email, setEmail] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [firstNameError, setFirstNameError] = useState('');
  const [lastNameError, setLastNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreedToLegal, setAgreedToLegal] = useState(false);
  const [legalAgreementError, setLegalAgreementError] = useState('');

  function handleEmailBlur() {
    setEmailError(validateEmail(email));
  }
  function handleLegalAgreementChange(checked: boolean) {
    setAgreedToLegal(checked);

    if (checked) {
      setLegalAgreementError('');
    }
  }
  async function handleSignUp() {
    if (isSubmitting) return;

    const emailValidation = validateEmail(email);
    const firstError = validateRequired(firstName);
    const lastError = validateRequired(lastName);
    const passError = validatePassword(password);
    const confirmError = validatePasswordMatch(password, confirmPassword);
    const legalError = validateRequired(agreedToLegal ? 'agreed' : '');
    setLegalAgreementError(legalError);
    setEmailError(emailValidation);
    setFirstNameError(firstError);
    setLastNameError(lastError);
    setPasswordError(passError);
    setConfirmPasswordError(confirmError);

    if (
      emailValidation ||
      firstError ||
      lastError ||
      passError ||
      confirmError ||
      legalError
    ) {
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          agreedToLegal: true,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 409 && result.code === 'EMAIL_TAKEN') {
          setEmailError('This email is already in use.');
          return;
        }

        setEmailError(
          result.message || 'Something went wrong. Please try again.'
        );
        return;
      }

      router.push('/signup/success');
    } catch {
      setEmailError('Unable to connect to server.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    email,
    setEmail,
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
    emailError,
    passwordError,
    confirmPasswordError,
    handleEmailBlur,
    handleSignUp,
    isSubmitting,
    agreedToLegal,
    setAgreedToLegal,
    legalAgreementError,
    handleLegalAgreementChange,
  };
}
