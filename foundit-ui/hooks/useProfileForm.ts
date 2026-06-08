'use client';

import { useEffect, useState } from 'react';
import {
  getAccessToken,
  getLoggedInUser,
  setLoggedInUser,
  type LoggedInUser,
  type UserRole,
} from '@/utils/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

interface UserProfileResponse {
  userId: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  campusId: string | null;
  campusName: string | null;
  phone: string | null;
  employeeId: string | null;
  studentNumber: number | null;
  emailNotificationOptIn: boolean;
}

function toLoggedInUser(profile: UserProfileResponse): LoggedInUser {
  return {
    userId: profile.userId,
    email: profile.email,
    role: profile.role,
    firstName: profile.firstName,
    lastName: profile.lastName,
    campusId: profile.campusId,
    campusName: profile.campusName,
    phone: profile.phone,
    employeeId: profile.employeeId,
  };
}

function buildInitialState() {
  const storedUser = getLoggedInUser();
  return {
    firstName: storedUser?.firstName ?? '',
    lastName: storedUser?.lastName ?? '',
    email: storedUser?.email ?? '',
    phoneNumber: storedUser?.phone ?? '',
    employeeId: storedUser?.employeeId ?? '',
    campusName: storedUser?.campusName ?? '',
    studentNumber: '',
    role: storedUser?.role ?? ('student' as UserRole),
    emailNotificationOptIn: false,
  };
}

export function useProfileForm() {
  const initial = buildInitialState();

  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [email, setEmail] = useState(initial.email);
  const [phoneNumber, setPhoneNumber] = useState(initial.phoneNumber);
  const [employeeId, setEmployeeId] = useState(initial.employeeId);
  const [campusName, setCampusName] = useState(initial.campusName);
  const [studentNumber, setStudentNumber] = useState(initial.studentNumber);
  const [role, setRole] = useState<UserRole>(initial.role);
  const [allowEmailNotifications, setAllowEmailNotifications] = useState(
    initial.emailNotificationOptIn
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>(
    'idle'
  );

  const fullName = `${firstName} ${lastName}`.trim();

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

        if (!res.ok) {
          return;
        }

        const data = (await res.json()) as UserProfileResponse;
        setFirstName(data.firstName);
        setLastName(data.lastName);
        setEmail(data.email);
        setPhoneNumber(data.phone ?? '');
        setEmployeeId(data.employeeId ?? '');
        setCampusName(data.campusName ?? '');
        setStudentNumber(
          data.studentNumber !== null ? String(data.studentNumber) : ''
        );
        setRole(data.role);
        setAllowEmailNotifications(data.emailNotificationOptIn);
        setLoggedInUser(toLoggedInUser(data));
      } catch {
        // Keep localStorage-seeded values when the API is unavailable.
      } finally {
        setIsLoading(false);
      }
    }

    void loadProfile();
  }, []);

  const handleSave = async () => {
    const token = getAccessToken();
    if (!token || !firstName.trim() || !lastName.trim()) {
      setSaveStatus('error');
      return;
    }

    setIsSaving(true);
    setSaveStatus('idle');

    try {
      const profileRes = await fetch(`${API_BASE}/api/users/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phoneNumber.trim() || null,
        }),
      });

      let notifOk = true;
      if (role === 'student') {
        const notifRes = await fetch(`${API_BASE}/api/users/me/notifications`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            emailNotificationOptIn: allowEmailNotifications,
          }),
        });
        notifOk = notifRes.ok;
      }

      if (profileRes.ok) {
        const data = (await profileRes.json()) as UserProfileResponse;
        setFirstName(data.firstName);
        setLastName(data.lastName);
        setPhoneNumber(data.phone ?? '');
        setEmployeeId(data.employeeId ?? '');
        setCampusName(data.campusName ?? '');
        setStudentNumber(
          data.studentNumber !== null ? String(data.studentNumber) : ''
        );
        setAllowEmailNotifications(data.emailNotificationOptIn);
        setLoggedInUser(toLoggedInUser(data));
      }

      setSaveStatus(profileRes.ok && notifOk ? 'success' : 'error');
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
    email,
    phoneNumber,
    setPhoneNumber,
    employeeId,
    campusName,
    studentNumber,
    role,
    allowEmailNotifications,
    setAllowEmailNotifications,
    isLoading,
    isSaving,
    saveStatus,
    handleSave,
    initials,
  };
}
