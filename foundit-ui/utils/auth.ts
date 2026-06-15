import { ROLE_HOME, type UserRole } from './routes';

export type { UserRole };
export { ROLE_HOME };

const ROLE_COOKIE = 'foundit_role';

export function setSessionRole(role: UserRole) {
  document.cookie = `${ROLE_COOKIE}=${role}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
}

export function clearSessionRole() {
  document.cookie = `${ROLE_COOKIE}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

/** Clears client-side auth state (role cookie + stored tokens). */
export function clearAuthSession() {
  clearSessionRole();
  if (typeof window !== 'undefined') {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    localStorage.removeItem('refreshToken');
  }
}

/** Signs out and navigates to login so middleware sees cleared cookies. */
export function signOut() {
  clearAuthSession();
  window.location.href = '/login';
}

export function getSessionRole(): UserRole | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${ROLE_COOKIE}=`));

  if (!match) {
    return null;
  }

  const value = match.split('=')[1] as UserRole;
  if (value === 'student' || value === 'security' || value === 'admin') {
    return value;
  }

  return null;
}

export function getRoleHome(role: UserRole): string {
  return ROLE_HOME[role];
}

export interface LoggedInUser {
  userId: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  campusId?: string | null;
  campusName?: string | null;
  phone?: string | null;
  employeeId?: string | null;
}

export function setLoggedInUser(user: LoggedInUser) {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem('user', JSON.stringify(user));
}

export async function fetchLoggedInUserProfile(): Promise<LoggedInUser | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  const accessToken = localStorage.getItem('accessToken');
  if (!apiUrl || !accessToken) {
    return getLoggedInUser();
  }

  try {
    const response = await fetch(`${apiUrl}/api/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return getLoggedInUser();
    }

    const data = (await response.json()) as LoggedInUser & {
      studentNumber?: number | null;
    };
    const profile: LoggedInUser = {
      userId: data.userId,
      email: data.email,
      role: data.role,
      firstName: data.firstName,
      lastName: data.lastName,
      campusId: data.campusId,
      campusName: data.campusName ?? null,
      phone: data.phone ?? null,
      employeeId: data.employeeId ?? null,
    };
    setLoggedInUser(profile);
    return profile;
  } catch {
    return getLoggedInUser();
  }
}

export function getLoggedInUser(): LoggedInUser | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = localStorage.getItem('user');
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as LoggedInUser;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

export function getLoggedInDisplayName(): string | null {
  const user = getLoggedInUser();
  if (!user?.firstName) {
    return null;
  }
  return `${user.firstName} ${user.lastName}`.trim();
}
