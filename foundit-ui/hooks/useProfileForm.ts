'use client';

import { useEffect, useState } from 'react';
import { getLoggedInUser, getAccessToken } from '@/utils/auth';

import { API_BASE } from '@/lib/api/client';

// Prefill sources per field:
//   fullName, email            → localStorage key 'user' (stored at login)
//   studentId                  → GET /api/users/me → studentNumber
//   emailNotificationOptIn     → GET /api/users/me
const PLACEHOLDER = {
  fullName: '',
  email: '',
  emailNotificationOptIn: true,
};

interface UserProfileResponse {
  firstName: string;
  lastName: string;
  email: string;
  studentNumber: number | null;
  emailNotificationOptIn: boolean;
}

/** Seneca student numbers are 9 digits (100000000–999999999). */
function parseStudentId(value: string): number | null | 'invalid' {
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  if (!/^\d{9}$/.test(digits)) return 'invalid';
  const n = Number(digits);
  if (n < 100000000 || n > 999999999) return 'invalid';
  return n;
}

export function useProfileForm() {
  // Pre-seed from localStorage if available, otherwise use placeholder data
  // so the page is viewable before the API responds.
  const storedUser = getLoggedInUser();

  const [fullName, setFullName] = useState(
    storedUser
      ? `${storedUser.firstName} ${storedUser.lastName}`.trim()
      : PLACEHOLDER.fullName
  );
  const [email, setEmail] = useState(storedUser?.email ?? PLACEHOLDER.email);
  const [studentId, setStudentId] = useState('');
  const [studentIdError, setStudentIdError] = useState('');
  const [allowEmailNotifications, setAllowEmailNotifications] = useState(
    PLACEHOLDER.emailNotificationOptIn
  );
  const [isLoading, setIsLoading] = useState(true);

  // Separate saving state so the Save button can show an activity indicator
  // independently from the initial page load.
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>(
    'idle'
  );
  const [saveErrorMessage, setSaveErrorMessage] = useState('');

  // On mount: fetch full profile to populate student number and notification pref.
  useEffect(() => {
    async function loadProfile() {
      const token = getAccessToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data: UserProfileResponse = await res.json();
          setFullName(`${data.firstName} ${data.lastName}`.trim());
          setEmail(data.email);
          setStudentId(
            data.studentNumber != null ? String(data.studentNumber) : ''
          );
          setAllowEmailNotifications(data.emailNotificationOptIn);
        }
        // 4xx — silently keep localStorage-seeded defaults
      } catch {
        // Network error — keep defaults
      } finally {
        setIsLoading(false);
      }
    }

    loadProfile();
  }, []);

  // Called only when the user clicks Save. PUT replaces editable profile fields.
  const handleSave = async (options?: { includeStudentId?: boolean }) => {
    const token = getAccessToken();
    if (!token) {
      setSaveStatus('error');
      setSaveErrorMessage('Save failed. Please try again.');
      return;
    }

    const includeStudentId = options?.includeStudentId ?? false;
    let studentNumber: number | null | undefined;

    if (includeStudentId) {
      const parsed = parseStudentId(studentId);
      if (parsed === 'invalid') {
        setStudentIdError('Enter a valid 9-digit Seneca student ID');
        setSaveStatus('error');
        setSaveErrorMessage('');
        return;
      }
      setStudentIdError('');
      studentNumber = parsed;
    }

    setIsSaving(true);
    setSaveStatus('idle');
    setSaveErrorMessage('');

    try {
      const [firstName = '', ...rest] = fullName.trim().split(/\s+/);
      const lastName = rest.join(' ');

      const body: {
        firstName: string;
        lastName: string;
        studentNumber?: number | null;
      } = {
        firstName,
        lastName: lastName || firstName,
      };
      if (includeStudentId) {
        body.studentNumber = studentNumber ?? null;
      }

      const profileRes = await fetch(`${API_BASE}/api/users/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (profileRes.ok) {
        setSaveStatus('success');
        return;
      }

      const errBody = (await profileRes.json().catch(() => null)) as {
        message?: string;
        code?: string;
      } | null;
      setSaveStatus('error');
      setSaveErrorMessage(
        errBody?.code === 'STUDENT_NUMBER_TAKEN'
          ? (errBody.message ??
              'That student ID is already linked to another account.')
          : (errBody?.message ?? 'Save failed. Please try again.')
      );
    } catch {
      setSaveStatus('error');
      setSaveErrorMessage('Save failed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const initials = fullName
    .trim()
    .split(/\s+/)
    .map((n) => n[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return {
    fullName,
    setFullName,
    email,
    setEmail,
    studentId,
    setStudentId,
    studentIdError,
    setStudentIdError,
    allowEmailNotifications,
    setAllowEmailNotifications,
    isLoading,
    isSaving,
    saveStatus,
    saveErrorMessage,
    handleSave,
    initials,
  };
}
