import { parseRole, ROLE_HOME, type UserRole } from './routes';
import { clearProfilePhoto } from './profilePhotoStore';

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
  clearProfilePhoto();
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

  return parseRole(match.split('=')[1]);
}

export function getRoleHome(role: UserRole): string {
  return ROLE_HOME[role];
}

/** Allow only same-origin relative paths for post-login redirects. */
export function sanitizeRedirect(
  path: string | null | undefined
): string | null {
  if (!path) return null;
  if (!path.startsWith('/') || path.startsWith('//') || path.includes(':')) {
    return null;
  }
  return path;
}

export interface LoggedInUser {
  userId: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  campusId?: string | null;
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

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('refreshToken');
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
}

export function getLoggedInDisplayName(): string | null {
  const user = getLoggedInUser();
  if (!user?.firstName) {
    return null;
  }
  return `${user.firstName} ${user.lastName}`.trim();
}
