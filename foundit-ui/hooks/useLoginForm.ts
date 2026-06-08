'use client';

import { useState } from 'react';
import { validateEmail } from '@/utils/validation';
import {
  getRoleHome,
  setLoggedInUser,
  setSessionRole,
  type LoggedInUser,
  type UserRole,
} from '@/utils/auth';

export function useLoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  function handleEmailBlur() {
    setEmailError(validateEmail(email));
  }

  async function handleLogin() {
    const emailValidation = validateEmail(email);
    const passwordValidation = !password ? 'Please enter your password.' : '';

    setEmailError(emailValidation);
    setPasswordError(passwordValidation);

    if (emailValidation || passwordValidation) {
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      setPasswordError(
        'API URL is not configured. Set NEXT_PUBLIC_API_URL in foundit-ui/.env.local.'
      );
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const result = await response.json();

      if (!response.ok) {
        setPasswordError(result.message || 'Login failed.');
        return;
      }

      localStorage.setItem('accessToken', result.accessToken);
      if (result.refreshToken) {
        localStorage.setItem('refreshToken', result.refreshToken);
      }
      setLoggedInUser(result.user as LoggedInUser);

      const role = result.user.role as UserRole;
      setSessionRole(role);

      // Full navigation so middleware sees the role cookie on the first request.
      window.location.href = getRoleHome(role);
    } catch {
      setPasswordError('Unable to connect to server.');
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
  };
}
