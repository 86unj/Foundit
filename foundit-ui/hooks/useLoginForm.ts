'use client';

import { useState } from 'react';
import { validateEmail } from '@/utils/validation';
import { apiFetch } from '@/lib/api/client';
import { debugError } from '@/utils/debug';
import {
  getRoleHome,
  sanitizeRedirect,
  setSessionRole,
  setTokens,
  type LoggedInUser,
} from '@/utils/auth';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: LoggedInUser;
}

export function useLoginForm(redirectTo?: string | null) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleEmailBlur() {
    setEmailError(validateEmail(email));
  }

  async function handleLogin() {
    if (isSubmitting) return;

    const emailValidation = validateEmail(email);
    const passwordValidation = !password ? 'Please enter your password.' : '';

    setEmailError(emailValidation);
    setPasswordError(passwordValidation);

    if (emailValidation || passwordValidation) {
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      // Config detail stays in the dev console — users get a plain message.
      debugError(
        'auth',
        'login aborted — NEXT_PUBLIC_API_URL is empty. Set it in foundit-ui/.env.local.'
      );
      setPasswordError(
        'Service is temporarily unavailable. Please try again later or contact support.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await apiFetch<LoginResponse>('/api/auth/login', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      setTokens(result.accessToken, result.refreshToken);
      localStorage.setItem('user', JSON.stringify(result.user));

      const role = result.user.role;
      setSessionRole(role);

      const destination = sanitizeRedirect(redirectTo) ?? getRoleHome(role);

      // Full navigation so middleware sees the role cookie on the first request.
      window.location.href = destination;
    } catch {
      setPasswordError('Unable to connect to server.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    email,
    setEmail,
    password,
    setPassword,
    emailError,
    passwordError,
    handleEmailBlur,
    handleLogin,
    isSubmitting,
  };
}
