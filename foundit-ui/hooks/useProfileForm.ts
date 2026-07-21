'use client';

import { useEffect, useState } from 'react';
import { getLoggedInUser, getAccessToken } from '@/utils/auth';

import { API_BASE } from '@/lib/api/client';

// TODO: Remove PLACEHOLDER once GET /api/users/me is implemented.
// Prefill sources per field once the endpoint is live:
//   fullName, email            → localStorage key 'user' (stored at login, read via getLoggedInUser())
//   phoneNumber                → GET /api/users/me  → response.phone
//   emailNotificationOptIn     → GET /api/users/me  → response.emailNotificationOptIn
// Empty strings (not fake sample data) so a real user never sees a wrong
// name/phone while the endpoint is missing.
const PLACEHOLDER = {
  fullName: '',
  email: '',
  phoneNumber: '',
  emailNotificationOptIn: true,
};

interface UserProfileResponse {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  emailNotificationOptIn: boolean;
}

export function useProfileForm() {
  // Pre-seed from localStorage if available, otherwise use placeholder data
  // so the page is viewable before the API is implemented.
  const storedUser = getLoggedInUser();

  const [fullName, setFullName] = useState(
    storedUser
      ? `${storedUser.firstName} ${storedUser.lastName}`.trim()
      : PLACEHOLDER.fullName
  );
  const [email, setEmail] = useState(storedUser?.email ?? PLACEHOLDER.email);
  const [phoneNumber, setPhoneNumber] = useState(PLACEHOLDER.phoneNumber);
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

  // On mount: fetch full profile to populate phone and notification pref.
  // Silently falls back to defaults while GET /api/users/me returns 501.
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
          setPhoneNumber(data.phone ?? '');
          setAllowEmailNotifications(data.emailNotificationOptIn);
        }
        // 501 / 4xx — silently keep localStorage-seeded defaults
      } catch {
        // Network error — keep defaults
      } finally {
        setIsLoading(false);
      }
    }

    loadProfile();
  }, []);

  // Called only when the user clicks Save. PUT replaces editable profile fields.
  const handleSave = async () => {
    const token = getAccessToken();
    if (!token) {
      setSaveStatus('error');
      return;
    }

    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    if (phoneNumber.trim() && normalizedPhone.length !== 10) {
      setSaveStatus('error');
      return;
    }

    setIsSaving(true);
    setSaveStatus('idle');

    try {
      const [firstName = '', ...rest] = fullName.trim().split(/\s+/);
      const lastName = rest.join(' ');

      const profileRes = await fetch(`${API_BASE}/api/users/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName,
          lastName: lastName || firstName,
          phone: normalizedPhone || null,
        }),
      });

      if (!profileRes.ok) {
        setSaveStatus('error');
        return;
      }

      const notificationRes = await fetch(
        `${API_BASE}/api/users/me/notifications`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            emailNotificationOptIn: allowEmailNotifications,
          }),
        }
      );

      setSaveStatus(notificationRes.ok ? 'success' : 'error');
    } catch {
      setSaveStatus('error');
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
    phoneNumber,
    setPhoneNumber,
    allowEmailNotifications,
    setAllowEmailNotifications,
    isLoading,
    isSaving,
    saveStatus,
    handleSave,
    initials,
  };
}
